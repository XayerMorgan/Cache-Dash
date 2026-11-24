import './style.css';
import L from 'leaflet';
import {
  loadAllCaches,
  saveCache,
  deleteCache,
  deleteAllCaches,
  state,
  loadSettings,
  saveSettings,
  createDefaultSettings
} from './store.js';
import { marked } from 'marked';
import faqRaw from '../FAQ.md?raw';
import NoSleep from 'nosleep.js';

// --- Default Leaflet Icon Workaround ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

// --- Expanded Outdoor Marker Icon Set (8 icons) ---
export const CACHE_ICONS = [
  {
    id: 'box',
    label: 'Stash',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>'
  },
  {
    id: 'tree',
    label: 'Trail',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3l-5.5 7.5h3L5.5 16h13l-4-5.5h3L12 3zm0 13v5" /></svg>'
  },
  {
    id: 'star',
    label: 'Star',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>'
  },
  {
    id: 'flag',
    label: 'Flag',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18m0-16.5h12.75l-2.25 4.5 2.25 4.5H3" /></svg>'
  },
  {
    id: 'compass',
    label: 'Beacon',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm3.75-12.75l-2.25 5.25-5.25 2.25 2.25-5.25 5.25-2.25z" /></svg>'
  },
  {
    id: 'gem',
    label: 'Gem',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 4h12l3 5-9 11L3 9l3-5zm-3 5h18" /></svg>'
  },
  {
    id: 'peak',
    label: 'Peak',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 19l6.5-11 4 6.5L16 11l5 8H3z" /></svg>'
  },
  {
    id: 'bolt',
    label: 'Sprint',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>'
  }
];

// --- Runtime State ---
let map = null;
let mapLayers = {};
let currentMapStyle = 'street';

let currentCacheMarker = null;
let activeCacheId = null;
let currentLocationMarker = null;
let gpsAccuracyCircle = null;
let adversaryMarker = null;
let adversaryDangerCircle = null;
let targetTetherLayer = null;
let targetRadiusCircle = null;
let sequenceRouteLayer = null;

let gameTimerInterval = null;
let sonarTimeout = null;
let wakeLock = null;
let autoConfirmActive = false;
let lastAlertTime = 0;
let globalAudioCtx = null;
let selectedIconId = 'box';
let rosterSortMode = 'sequence'; // 'sequence' | 'distance'
let simGpsEnabled = false;
let activeDrawerId = null;
let modalCloseHandler = null;
let lastFocusedElement = null;

window.isAutoCenter = true;

const mapMarkers = {};
const noSleep = new NoSleep();

// --- Utilities ---
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStoredHome() {
  const raw = localStorage.getItem('locus_home');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lng)) return parsed;
  } catch (_) {}
  return null;
}

function setStoredHome(lat, lng) {
  localStorage.setItem('locus_home', JSON.stringify({ lat, lng }));
}

export function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingToCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function formatDistance(miles) {
  if (!Number.isFinite(miles)) return '--';
  const units = state.settings.units || 'imperial';
  if (units === 'metric') {
    const meters = miles * 1609.344;
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }
  const feet = miles * 5280;
  if (miles < 0.15) return `${Math.round(feet)} ft`;
  return `${miles.toFixed(2)} mi`;
}

function formatTriggerRadius(feet) {
  const units = state.settings.units || 'imperial';
  if (units === 'metric') {
    return `${Math.round(feet * 0.3048)} m`;
  }
  return `${Math.round(feet)} ft`;
}

// --- Toast Notifications (Replaces all browser alert() calls) ---
function showToast(message, type = 'info', durationMs = 3400) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;

  container.appendChild(toast);
  while (container.children.length > 3) {
    container.firstElementChild.remove();
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, durationMs);
}

// --- Non-blocking GPS Pill ---
function showGpsPill(text = 'Acquiring GPS signal…') {
  const pill = document.getElementById('gps-status-pill');
  const txt = document.getElementById('gps-status-text');
  if (txt) txt.textContent = text;
  if (pill) pill.hidden = false;
}

function hideGpsPill() {
  const pill = document.getElementById('gps-status-pill');
  if (pill) pill.hidden = true;
}

// --- Wake Lock ---
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (_) {}
  try {
    if (!noSleep.isEnabled) noSleep.enable();
  } catch (_) {}
}

async function releaseWakeLock() {
  if (wakeLock !== null) {
    try {
      await wakeLock.release();
    } catch (_) {}
    wakeLock = null;
  }
  try {
    if (noSleep.isEnabled) noSleep.disable();
  } catch (_) {}
}

// --- Audio & Local TTS Engine ---
function getAudioContext() {
  if (!globalAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) globalAudioCtx = new AudioCtx();
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

function playTone(freq, duration = 0.18, type = 'sine', volume = 0.08, delay = 0) {
  if (!state.settings.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch (_) {}
}

function playCaptureChime(combo = 1) {
  const base = combo >= 3 ? 660 : combo === 2 ? 587 : 523.25;
  playTone(base, 0.14, 'triangle', 0.1, 0);
  playTone(base * 1.25, 0.16, 'triangle', 0.1, 0.09);
  playTone(base * 1.5, 0.28, 'sine', 0.11, 0.18);
}

function playVictoryFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, idx) => playTone(n, 0.26, 'triangle', 0.1, idx * 0.11));
}

function playRedAlert() {
  if (!state.settings.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(780, ctx.currentTime);
    osc.frequency.setValueAtTime(560, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.36);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  } catch (_) {}
}

function speakLocal(text) {
  if (!state.settings.voiceEnabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}

function stopSonarLoop() {
  if (sonarTimeout) {
    clearTimeout(sonarTimeout);
    sonarTimeout = null;
  }
}

function scheduleSonarPing() {
  stopSonarLoop();
  if (!state.settings.game?.isActive || !state.settings.sonarEnabled || !state.settings.soundEnabled) {
    return;
  }

  const targetId = state.settings.game.activeTargetId;
  const home = getStoredHome();
  const target = state.caches.find((c) => c.id === targetId && !c.checkedInTime);

  let nextDelay = 2600;
  if (home && target) {
    const distFeet = calculateDistanceMiles(home.lat, home.lng, target.lat, target.lng) * 5280;
    const triggerFt = state.settings.triggerRadiusFt || 75;
    // Scale warmth from 0 (1500+ ft) to 1 (at trigger radius)
    const warmth = Math.max(0, Math.min(1, 1 - (distFeet - triggerFt) / 1400));
    const freq = 380 + warmth * 680;
    nextDelay = Math.round(2800 - warmth * 2300);
    playTone(freq, 0.09, 'sine', 0.06);
  }

  sonarTimeout = setTimeout(scheduleSonarPing, nextDelay);
}

// --- Theme & Map Style ---
function applyTheme(theme) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', safeTheme);
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeChoice === safeTheme);
  });
}

function applyUnitsUI(units) {
  const safeUnits = units === 'metric' ? 'metric' : 'imperial';
  document.querySelectorAll('[data-units-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.unitsChoice === safeUnits);
  });
  const radiusDisplay = document.getElementById('trigger-radius-display');
  if (radiusDisplay) {
    radiusDisplay.textContent = formatTriggerRadius(state.settings.triggerRadiusFt || 75);
  }
  updateDistanceBadge();
  if (activeDrawerId === 'roster-drawer') renderRoster();
}

function applyMapStyle(styleKey, notify = false) {
  const valid = ['street', 'satellite', 'topo'].includes(styleKey) ? styleKey : 'street';
  currentMapStyle = valid;
  if (map) {
    Object.entries(mapLayers).forEach(([key, layer]) => {
      if (key === valid) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    const container = document.getElementById('map-container');
    if (container) {
      container.classList.toggle('map-street-tiles', valid === 'street');
    }
  }

  const tagMap = { street: 'MAP', satellite: 'SAT', topo: 'TOPO' };
  const labelMap = { street: 'Street', satellite: 'Satellite', topo: 'Topographic' };
  const tagEl = document.getElementById('map-style-tag');
  const toggleBtn = document.getElementById('btn-map-toggle');
  if (tagEl) tagEl.textContent = tagMap[valid];
  if (toggleBtn) toggleBtn.title = `Map Style: ${labelMap[valid]}`;

  document.querySelectorAll('[data-map-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mapChoice === valid);
  });

  if (notify) showToast(`Map view: ${labelMap[valid]}`, 'info', 1800);
}

window.toggleMapLayer = async () => {
  const order = ['street', 'satellite', 'topo'];
  const next = order[(order.indexOf(currentMapStyle) + 1) % order.length];
  applyMapStyle(next, true);
  await saveSettings({ mapStyle: next });
};

// --- Drawer Management (Accessible + Escape + Focus Restore) ---
function openDrawerById(id) {
  closeAllDrawers(false);
  const drawer = document.getElementById(id);
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer || !backdrop) return;

  lastFocusedElement = document.activeElement;
  activeDrawerId = id;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('active');
  backdrop.setAttribute('aria-hidden', 'false');

  if (id === 'roster-drawer') renderRoster();
  if (id === 'settings-drawer') syncSettingsUI();

  const firstFocusable = drawer.querySelector('input, button, textarea, select');
  if (firstFocusable) setTimeout(() => firstFocusable.focus(), 80);
}

function closeAllDrawers(restoreFocus = true) {
  const wasDesigner = activeDrawerId === 'designer-drawer';
  document.querySelectorAll('.drawer.open').forEach((d) => {
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
  });
  const backdrop = document.getElementById('drawer-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  activeDrawerId = null;

  if (wasDesigner) {
    if (currentCacheMarker && map) {
      map.removeLayer(currentCacheMarker);
      currentCacheMarker = null;
    }
    activeCacheId = null;
    renderAllSavedPins();
  }

  if (restoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

// --- Custom Accessible Modal System ---
function showCustomModal(title, message, options = {}) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('custom-modal-backdrop');
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const inputContainer = document.getElementById('modal-input-container');
    const inputLabel = document.getElementById('modal-input-label');
    const inputEl = document.getElementById('modal-input');
    const storyContainer = document.getElementById('modal-story-container');
    const storyEl = document.getElementById('modal-story-textarea');
    const timeContainer = document.getElementById('modal-time-container');
    const timeInput = document.getElementById('modal-time-input');
    const htmlContainer = document.getElementById('modal-html-container');
    const footer = document.getElementById('modal-footer');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');
    const btnX = document.getElementById('modal-btn-x');

    const prevFocus = document.activeElement;

    titleEl.textContent = title;
    msgEl.innerHTML = message || '';

    if (options.htmlContent) {
      htmlContainer.hidden = false;
      htmlContainer.innerHTML = options.htmlContent;
    } else {
      htmlContainer.hidden = true;
      htmlContainer.innerHTML = '';
    }

    if (options.showInput) {
      inputContainer.hidden = false;
      inputLabel.textContent = options.inputLabel || 'Mission Goal Title';
      inputEl.value = options.inputValue ?? '';
      inputEl.placeholder = options.inputPlaceholder || 'Enter value…';
    } else {
      inputContainer.hidden = true;
    }

    if (options.showStory) {
      storyContainer.hidden = false;
      storyEl.value = options.storyValue ?? '';
    } else {
      storyContainer.hidden = true;
    }

    if (options.showTimeInfo) {
      timeContainer.hidden = false;
      timeInput.value = options.timeValue ?? 0;
    } else {
      timeContainer.hidden = true;
    }

    btnConfirm.textContent = options.confirmText || 'Confirm';
    btnCancel.textContent = options.cancelText || 'Cancel';
    btnConfirm.className = options.confirmClass || 'btn-primary';

    if (options.hideDefaultButtons) {
      footer.hidden = true;
    } else {
      footer.hidden = false;
      btnCancel.hidden = !!options.hideCancel;
    }

    btnX.hidden = !!options.lockDismiss;

    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    const finish = (val) => {
      backdrop.classList.remove('active');
      backdrop.setAttribute('aria-hidden', 'true');
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      btnConfirm.onclick = null;
      btnCancel.onclick = null;
      btnX.onclick = null;
      backdrop.onclick = null;
      modalCloseHandler = null;
      if (prevFocus && typeof prevFocus.focus === 'function') {
        setTimeout(() => prevFocus.focus(), 40);
      }
      resolve(val);
    };

    modalCloseHandler = () => {
      if (!options.lockDismiss) finish(null);
    };

    btnConfirm.onclick = () => {
      if (options.htmlContent) {
        finish(htmlContainer);
      } else if (options.showInput || options.showStory || options.showTimeInfo) {
        finish({
          text: inputEl.value,
          story: storyEl.value,
          timeMinutes: Math.max(0, parseInt(timeInput.value, 10) || 0)
        });
      } else {
        finish(true);
      }
    };

    btnCancel.onclick = () => finish(null);
    btnX.onclick = () => finish(null);
    backdrop.onclick = () => {
      if (!options.lockDismiss) finish(null);
    };

    setTimeout(() => {
      if (options.showInput) {
        inputEl.focus();
        inputEl.select();
      } else {
        const focusTarget = modal.querySelector('input, button:not([hidden])');
        if (focusTarget) focusTarget.focus();
      }
    }, 80);
  });
}

function dismissActiveModal() {
  if (modalCloseHandler) modalCloseHandler();
}

// --- Mission Header & Dock Status Sync ---
function getTotalPossibleScore() {
  return (state.caches || []).reduce((sum, c) => {
    if (c.checkedInTime) return sum + (c.pointsAwarded || 0);
    return sum + (c.points !== undefined ? c.points : 10);
  }, 0);
}

function updateMissionHeader() {
  const count = state.caches.length;
  const totalPts = state.caches.reduce((s, c) => s + (c.points !== undefined ? c.points : 10), 0);
  const goal = state.settings.narrativeGoal || 'Find the hidden treasures around town!';
  const story = (state.settings.narrativeStory || '').trim();
  const targetMins = state.settings.targetTimeMinutes || 0;
  const adv = state.settings.game?.adversary;

  const titleEl = document.getElementById('narrative-text');
  if (titleEl) titleEl.textContent = goal;

  const countChip = document.getElementById('meta-cache-count');
  if (countChip) countChip.textContent = `${count} ${count === 1 ? 'Cache' : 'Caches'}`;

  const ptsChip = document.getElementById('meta-points-total');
  if (ptsChip) ptsChip.textContent = `${totalPts} pts`;

  const modeChip = document.getElementById('meta-mode-chip');
  if (modeChip) modeChip.textContent = state.settings.isSequential ? 'Sequential' : 'Free Roam';

  const timerChip = document.getElementById('meta-timer-chip');
  if (timerChip) timerChip.textContent = targetMins > 0 ? `${targetMins}m Limit` : 'Open Timer';

  const storyBtn = document.getElementById('btn-read-story');
  if (storyBtn) storyBtn.hidden = !story;

  const rosterBadge = document.getElementById('dock-roster-count');
  if (rosterBadge) rosterBadge.textContent = String(count);

  const hunterBtn = document.getElementById('btn-adversary-mode');
  const hunterDot = document.getElementById('hunter-active-dot');
  const hunterLbl = document.getElementById('dock-hunter-label');
  const hunterActive = !!(adv?.isActive && adv?.speedLevel > 0);
  if (hunterBtn) hunterBtn.classList.toggle('hunter-on', hunterActive);
  if (hunterDot) hunterDot.hidden = !hunterActive;
  if (hunterLbl) {
    const names = { 1: 'Stalker', 2: 'Hunter', 3: 'Slayer' };
    hunterLbl.textContent = hunterActive ? names[adv.speedLevel] || 'Hunter' : 'Hunter';
  }

  const simBadge = document.getElementById('virtual-gps-badge');
  if (simBadge) simBadge.hidden = !simGpsEnabled;
}

// --- Map Initialization ---
async function initMap() {
  map = L.map('map-container', {
    zoomControl: false,
    attributionControl: true
  }).setView([39.09, -96.71], 5);

  mapLayers = {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }),
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
      }
    ),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; OpenTopoMap'
    })
  };

  // Unlock Follow Mode whenever the user drags the map manually
  map.on('dragstart', () => {
    if (window.isAutoCenter) {
      setFollowMode(false);
    }
  });

  // Map Click: Drop/move pin while Designer Drawer is open, OR simulate GPS movement in Indoor Test Mode
  map.on('click', (e) => {
    if (activeDrawerId === 'designer-drawer') {
      updateDraftMarker(e.latlng, true);
      return;
    }
    if (simGpsEnabled && state.settings.game?.isActive) {
      updateUserLocationMarker(e.latlng.lat, e.latlng.lng, 10);
      setStoredHome(e.latlng.lat, e.latlng.lng);
      showToast('Simulated GPS moved', 'info', 1200);
    }
  });

  // Load persisted settings and caches
  try {
    await loadSettings();
    await loadAllCaches();

    applyTheme(state.settings.theme);
    applyMapStyle(state.settings.mapStyle || 'street', false);
    applyUnitsUI(state.settings.units || 'imperial');
    updateMissionHeader();

    if (state.settings.game?.isActive) {
      startGameLoop(true);
    }

    renderAllSavedPins();
    updateDistanceBadge();
  } catch (err) {
    console.error('Failed to load local IndexedDB:', err);
    showToast('Could not load saved local data.', 'error');
  }

  startLocationWatcher();
}

function setFollowMode(enabled) {
  window.isAutoCenter = !!enabled;
  const btn = document.getElementById('btn-my-location');
  if (btn) {
    btn.classList.toggle('active', window.isAutoCenter);
    btn.setAttribute('aria-pressed', String(window.isAutoCenter));
    btn.title = window.isAutoCenter ? 'Following Location (Tap to unlock)' : 'Center on My Location';
  }
}

function updateUserLocationMarker(lat, lng, accuracyMeters = null) {
  const latlng = { lat, lng };
  if (!currentLocationMarker) {
    const gpsDotIcon = L.divIcon({
      className: 'user-location-dot',
      html: '<div class="user-gps-dot"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    currentLocationMarker = L.marker(latlng, { icon: gpsDotIcon, zIndexOffset: 1000, interactive: false }).addTo(map);
  } else {
    currentLocationMarker.setLatLng(latlng);
  }

  if (Number.isFinite(accuracyMeters) && accuracyMeters > 0 && accuracyMeters < 500) {
    if (!gpsAccuracyCircle) {
      gpsAccuracyCircle = L.circle(latlng, {
        radius: accuracyMeters,
        color: '#2563eb',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        interactive: false
      }).addTo(map);
    } else {
      gpsAccuracyCircle.setLatLng(latlng).setRadius(accuracyMeters);
    }
  }

  if (state.settings.game?.isActive && window.isAutoCenter && map) {
    map.panTo(latlng, { animate: true });
  }
  updateDistanceBadge();
  updateActiveOverlayLines();
}

// --- Live Location Watcher ---
async function startLocationWatcher() {
  // Compass Orientation fallback when stationary
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientationabsolute', (e) => {
      if (typeof e.alpha === 'number') {
        window.locusUserCompass = (360 - e.alpha) % 360;
        if (state.settings.game?.isActive) updateDistanceBadge();
      }
    });
    window.addEventListener('deviceorientation', (e) => {
      if (typeof e.webkitCompassHeading === 'number') {
        window.locusUserCompass = e.webkitCompassHeading;
        if (state.settings.game?.isActive) updateDistanceBadge();
      } else if (typeof e.alpha === 'number' && !('ondeviceorientationabsolute' in window)) {
        window.locusUserCompass = (360 - e.alpha) % 360;
        if (state.settings.game?.isActive) updateDistanceBadge();
      }
    });
  }

  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
      if (!err && position && !simGpsEnabled) {
        if (typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)) {
          window.locusUserHeading = position.coords.heading;
        }
        hideGpsPill();
        setStoredHome(position.coords.latitude, position.coords.longitude);
        updateUserLocationMarker(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      }
    });
  } catch (_) {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          if (simGpsEnabled) return;
          if (typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)) {
            window.locusUserHeading = pos.coords.heading;
          }
          hideGpsPill();
          setStoredHome(pos.coords.latitude, pos.coords.longitude);
          updateUserLocationMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => {
          hideGpsPill();
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }
  }
}

// --- Target Selection Helper (Respects Sequential Mode!) ---
function pickNextTargetId() {
  const remaining = state.caches.filter((c) => !c.checkedInTime);
  if (remaining.length === 0) return null;

  if (state.settings.isSequential) {
    remaining.sort((a, b) => (a.sequenceNum || 9999) - (b.sequenceNum || 9999));
    return remaining[0].id;
  }

  const home = getStoredHome();
  if (home) {
    let bestId = remaining[0].id;
    let minDist = Infinity;
    for (const c of remaining) {
      const d = calculateDistanceMiles(home.lat, home.lng, c.lat, c.lng);
      if (d < minDist) {
        minDist = d;
        bestId = c.id;
      }
    }
    return bestId;
  }

  return remaining[0].id;
}

// --- Active Map Visual Overlays (Tether Line, Capture Radius, Sequence Route) ---
function clearActiveOverlayLines() {
  if (targetTetherLayer && map) {
    map.removeLayer(targetTetherLayer);
    targetTetherLayer = null;
  }
  if (targetRadiusCircle && map) {
    map.removeLayer(targetRadiusCircle);
    targetRadiusCircle = null;
  }
}

function updateActiveOverlayLines() {
  clearActiveOverlayLines();
  if (!map || !state.settings.game?.isActive) return;

  const target = state.caches.find((c) => c.id === state.settings.game.activeTargetId && !c.checkedInTime);
  if (!target) return;

  // Draw Auto-Trigger capture radius ring around active target
  const radiusMeters = (state.settings.triggerRadiusFt || 75) * 0.3048;
  targetRadiusCircle = L.circle([target.lat, target.lng], {
    radius: radiusMeters,
    color: '#d97706',
    weight: 2,
    dashArray: '6 6',
    fillColor: '#fbbf24',
    fillOpacity: 0.16,
    interactive: false
  }).addTo(map);

  // Draw live dashed bearing tether from player to target
  const home = getStoredHome();
  if (home) {
    targetTetherLayer = L.polyline(
      [
        [home.lat, home.lng],
        [target.lat, target.lng]
      ],
      {
        color: '#1d4ed8',
        weight: 3,
        dashArray: '8 8',
        opacity: 0.78,
        interactive: false
      }
    ).addTo(map);
  }
}

function renderSequenceRoute() {
  if (sequenceRouteLayer && map) {
    map.removeLayer(sequenceRouteLayer);
    sequenceRouteLayer = null;
  }
  if (!map || !state.settings.isSequential || state.caches.length < 2) return;

  const sorted = [...state.caches].sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));
  const coords = sorted.map((c) => [c.lat, c.lng]);
  sequenceRouteLayer = L.polyline(coords, {
    color: '#15803d',
    weight: 3,
    dashArray: '5 9',
    opacity: 0.65,
    interactive: false
  }).addTo(map);
}

// --- Game Loop Engine ---
function setGameplayChrome(active) {
  const navContainer = document.getElementById('narrative-container');
  const preDock = document.getElementById('pre-game-dock');
  const hudPanel = document.getElementById('game-hud-panel');
  const activeBar = document.getElementById('active-game-bar');

  if (navContainer) navContainer.hidden = active;
  if (preDock) preDock.hidden = active;
  if (hudPanel) hudPanel.hidden = !active;
  if (activeBar) activeBar.hidden = !active;

  const sonarBtn = document.getElementById('btn-hud-sonar');
  if (sonarBtn) {
    sonarBtn.setAttribute('aria-pressed', String(!!state.settings.sonarEnabled));
  }
}

async function startGameLoop(isResume = false) {
  if (state.caches.length === 0) {
    showToast('Add or scatter at least one cache before starting a race.', 'warning');
    return;
  }

  requestWakeLock();
  closeAllDrawers(false);

  // Clear any old Adversary markers
  despawnAdversary();

  if (!isResume || !state.settings.game?.startTime) {
    // Reset previous check-ins for a fresh run
    for (const c of state.caches) {
      if (c.checkedInTime) {
        c.checkedInTime = null;
        c.pointsAwarded = 0;
        await saveCache(c);
      }
    }

    // Respect user's manual target in Free Roam; enforce #1 in Sequential Mode
    let targetIdToUse = state.settings.isSequential
      ? pickNextTargetId()
      : (state.settings.game?.activeTargetId &&
          state.caches.some((c) => c.id === state.settings.game.activeTargetId && !c.checkedInTime))
        ? state.settings.game.activeTargetId
        : pickNextTargetId();

    await saveSettings({
      game: {
        ...state.settings.game,
        isActive: true,
        startTime: Date.now(),
        score: 0,
        bestCombo: 1,
        lastCheckinTime: null,
        activeTargetId: targetIdToUse
      }
    });
  }

  // Ensure a home point exists if Indoor Test Mode is enabled so distance works immediately
  if (!getStoredHome() && map) {
    const center = map.getCenter();
    setStoredHome(center.lat, center.lng);
    updateUserLocationMarker(center.lat, center.lng);
  }

  setGameplayChrome(true);
  renderAllSavedPins();
  updateDistanceBadge();
  updateActiveOverlayLines();
  scheduleSonarPing();

  if (gameTimerInterval) clearInterval(gameTimerInterval);

  const tick = () => {
    const now = Date.now();
    const elapsedTotalSeconds = Math.max(0, Math.floor((now - (state.settings.game.startTime || now)) / 1000));
    const targetMinutes = state.settings.targetTimeMinutes || 0;
    const timerEl = document.getElementById('game-timer');

    if (targetMinutes > 0) {
      const remainingSeconds = targetMinutes * 60 - elapsedTotalSeconds;
      if (remainingSeconds <= 0) {
        if (timerEl) {
          timerEl.classList.add('urgent');
          timerEl.textContent = '00:00:00';
        }
        stopGameLoop();
        showCustomModal(
          'Time Up!',
          `Your ${targetMinutes}-minute countdown has finished.<br><br><strong>Score:</strong> ${state.settings.game.score || 0} points`,
          { hideCancel: true, confirmText: 'Back to Map' }
        );
        return;
      }
      const h = String(Math.floor(remainingSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(remainingSeconds % 60).padStart(2, '0');
      if (timerEl) {
        timerEl.classList.toggle('urgent', remainingSeconds <= 60);
        timerEl.textContent = `${h}:${m}:${s}`;
      }
    } else {
      const h = String(Math.floor(elapsedTotalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsedTotalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(elapsedTotalSeconds % 60).padStart(2, '0');
      if (timerEl) {
        timerEl.classList.remove('urgent');
        timerEl.textContent = `${h}:${m}:${s}`;
      }
    }

    // Live Combo Countdown Pill
    const comboBadge = document.getElementById('game-combo-badge');
    const lastTime = state.settings.game.lastCheckinTime;
    if (comboBadge) {
      if (lastTime) {
        const elapsed = Math.floor((now - lastTime) / 1000);
        if (elapsed <= 45) {
          comboBadge.hidden = false;
          comboBadge.textContent = `3x · ${45 - elapsed}s`;
        } else if (elapsed <= 90) {
          comboBadge.hidden = false;
          comboBadge.textContent = `2x · ${90 - elapsed}s`;
        } else {
          comboBadge.hidden = true;
        }
      } else {
        comboBadge.hidden = true;
      }
    }

    // Step Adversary Hunter Physics
    if (state.settings.game?.adversary?.isActive && state.settings.game.adversary.speedLevel > 0) {
      stepAdversary();
      updateDistanceBadge();
    }
  };

  tick();
  gameTimerInterval = setInterval(tick, 1000);

  if (!isResume) {
    showToast('Race started! Follow the golden beacon.', 'success', 2600);
    speakLocal(`Race started. ${state.settings.narrativeGoal || ''}`);
  }
}

function despawnAdversary() {
  if (adversaryMarker && map) {
    map.removeLayer(adversaryMarker);
    adversaryMarker = null;
  }
  if (adversaryDangerCircle && map) {
    map.removeLayer(adversaryDangerCircle);
    adversaryDangerCircle = null;
  }
  document.body.classList.remove('red-alert');
}

async function stopGameLoop() {
  releaseWakeLock();
  stopSonarLoop();
  if (gameTimerInterval) {
    clearInterval(gameTimerInterval);
    gameTimerInterval = null;
  }
  despawnAdversary();
  clearActiveOverlayLines();
  autoConfirmActive = false;

  await saveSettings({
    game: {
      ...state.settings.game,
      isActive: false,
      startTime: null
    }
  });

  setGameplayChrome(false);
  updateMissionHeader();
  renderAllSavedPins();
  updateDistanceBadge();
}

// --- Live HUD Telemetry & Proximity Logic ---
export function updateDistanceBadge() {
  const distValEl = document.getElementById('hud-distance-value');
  const bearingEl = document.getElementById('hud-bearing-text');
  const arrowEl = document.getElementById('hud-compass-arrow');
  const fillEl = document.getElementById('hud-proximity-fill');
  const targetNameEl = document.getElementById('hud-target-name');
  const progressPillEl = document.getElementById('hud-progress-pill');
  const scoreBadgeEl = document.getElementById('game-score-badge');
  const advBadge = document.getElementById('adv-status-badge');
  const checkinBtn = document.getElementById('btn-proximity-checkin');
  const checkinLabel = document.getElementById('proximity-checkin-label');

  const gameActive = !!state.settings.game?.isActive;
  const targetId = state.settings.game?.activeTargetId;
  const homeLoc = getStoredHome();

  const securedCount = state.caches.filter((c) => c.checkedInTime).length;
  if (progressPillEl) progressPillEl.textContent = `${securedCount} / ${state.caches.length}`;
  if (scoreBadgeEl) scoreBadgeEl.textContent = `${state.settings.game?.score || 0} / ${getTotalPossibleScore()} pts`;

  // --- Adversary HUD & Proximity Alarm ---
  if (advBadge) {
    const advCfg = state.settings.game?.adversary;
    if (gameActive && advCfg?.isActive && advCfg.speedLevel > 0) {
      advBadge.hidden = false;
      const names = { 1: 'Stalker', 2: 'Hunter', 3: 'Slayer' };
      let label = names[advCfg.speedLevel] || 'Hunter';
      let isDanger = false;

      if (adversaryMarker && homeLoc) {
        const advPos = adversaryMarker.getLatLng();
        const distM = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, advPos.lat, advPos.lng);
        const distF = distM * 5280;
        label += ` · ${formatDistance(distM)}`;
        isDanger = distF <= 500;
        document.body.classList.toggle('red-alert', isDanger);

        if (isDanger) {
          const now = Date.now();
          if (now - lastAlertTime > 2200) {
            lastAlertTime = now;
            playRedAlert();
            if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
          }
        }
      }
      advBadge.textContent = label;
      advBadge.classList.toggle('danger', isDanger);
    } else {
      advBadge.hidden = true;
      document.body.classList.remove('red-alert');
    }
  }

  if (!gameActive) {
    if (checkinBtn) checkinBtn.hidden = true;
    return;
  }

  // --- Auto-Trigger Proximity Check (Respects Sequential Order!) ---
  if (homeLoc && !autoConfirmActive) {
    const triggerRadius = state.settings.triggerRadiusFt || 75;
    const candidates = state.settings.isSequential
      ? state.caches.filter((c) => c.id === targetId && !c.checkedInTime)
      : state.caches.filter((c) => !c.checkedInTime);

    for (const c of candidates) {
      const distFt = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, c.lat, c.lng) * 5280;
      if (distFt <= triggerRadius) {
        autoConfirmActive = true;
        triggerAutoConfirm(c.id, c.name || 'Geocache');
        break;
      }
    }
  }

  // --- Active Target Distance, Bearing, Proximity Bar & Quick Check-In Button ---
  const targetCache = state.caches.find((c) => c.id === targetId && !c.checkedInTime);
  if (!targetCache) {
    if (targetNameEl) targetNameEl.textContent = 'Select a target cache';
    if (distValEl) distValEl.textContent = '--';
    if (bearingEl) bearingEl.textContent = 'Tap any pin or open Targets';
    if (fillEl) fillEl.style.width = '0%';
    if (checkinBtn) checkinBtn.hidden = true;
    return;
  }

  if (targetNameEl) {
    const prefix = state.settings.isSequential ? `#${targetCache.sequenceNum || 1} ` : '';
    targetNameEl.textContent = `${prefix}${targetCache.name || 'Unnamed Cache'}`;
  }

  if (!homeLoc) {
    if (distValEl) distValEl.textContent = '--';
    if (bearingEl) bearingEl.textContent = 'Waiting for GPS…';
    if (fillEl) fillEl.style.width = '0%';
    if (checkinBtn) checkinBtn.hidden = true;
    return;
  }

  const distMiles = calculateDistanceMiles(homeLoc.lat, homeLoc.lng, targetCache.lat, targetCache.lng);
  const distFeet = distMiles * 5280;
  const bearing = calculateBearing(homeLoc.lat, homeLoc.lng, targetCache.lat, targetCache.lng);

  let rot = bearing;
  let modeNote = 'True North';
  if (typeof window.locusUserCompass === 'number') {
    rot = bearing - window.locusUserCompass;
    modeNote = 'Compass';
  } else if (typeof window.locusUserHeading === 'number' && window.locusUserHeading !== 0) {
    rot = bearing - window.locusUserHeading;
    modeNote = 'Heading';
  }

  if (distValEl) distValEl.textContent = formatDistance(distMiles);
  if (bearingEl) bearingEl.textContent = `${bearingToCardinal(bearing)} · ${Math.round(bearing)}° (${modeNote})`;
  if (arrowEl) arrowEl.style.transform = `rotate(${rot}deg)`;

  // Fill proximity progress bar smoothly from 0.5 mi down to triggerRadius
  if (fillEl) {
    const triggerFt = state.settings.triggerRadiusFt || 75;
    const pct = Math.max(4, Math.min(100, Math.round((1 - (distFeet - triggerFt) / 2000) * 100)));
    fillEl.style.width = `${pct}%`;
  }

  // Contextual thumb-zone Check-In button when within 150 ft
  if (checkinBtn && checkinLabel) {
    if (distFeet <= 150) {
      checkinBtn.hidden = false;
      checkinLabel.textContent = `Check In: ${targetCache.name || 'Target'} (${formatDistance(distMiles)})`;
      checkinBtn.onclick = () => window.actionCheckIn(targetCache.id);
    } else {
      checkinBtn.hidden = true;
    }
  }
}

function triggerAutoConfirm(cacheId, cacheName) {
  let timeLeft = 4;
  let timerInterval = null;
  let completed = false;

  const safeName = escapeHtml(cacheName);
  showCustomModal(
    'Target Reached!',
    `You entered the capture zone for <strong>${safeName}</strong>.<br><br>Auto-securing in <strong id="auto-confirm-timer" style="font-size:1.25rem; color:var(--brand-emerald);">${timeLeft}s</strong>…`,
    {
      hideDefaultButtons: true,
      htmlContent: `
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button type="button" id="btn-auto-cancel" class="btn-secondary" style="flex:1;">Wait</button>
          <button type="button" id="btn-auto-confirm-now" class="btn-primary btn-emerald" style="flex:1.5;">Secure Now</button>
        </div>`
    }
  ).then(() => {
    if (timerInterval) clearInterval(timerInterval);
    if (!completed) {
      setTimeout(() => {
        autoConfirmActive = false;
      }, 5000);
    }
  });

  const completeCapture = () => {
    if (completed) return;
    completed = true;
    if (timerInterval) clearInterval(timerInterval);
    dismissActiveModal();
    window.actionCheckIn(cacheId);
    setTimeout(() => {
      autoConfirmActive = false;
    }, 1800);
  };

  timerInterval = setInterval(() => {
    timeLeft -= 1;
    const span = document.getElementById('auto-confirm-timer');
    if (span) span.textContent = `${Math.max(0, timeLeft)}s`;
    if (timeLeft <= 0) completeCapture();
  }, 1000);

  setTimeout(() => {
    const nowBtn = document.getElementById('btn-auto-confirm-now');
    const waitBtn = document.getElementById('btn-auto-cancel');
    if (nowBtn) nowBtn.onclick = completeCapture;
    if (waitBtn) waitBtn.onclick = () => dismissActiveModal();
  }, 60);
}

// --- Adversary Hunter Physics ---
function stepAdversary() {
  if (!currentLocationMarker || !state.settings.game?.isActive) return;
  const playerPos = currentLocationMarker.getLatLng();

  if (!adversaryMarker) {
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 0.25; // miles
    const latOffset = (spawnDist / 69) * Math.cos(angle);
    const lngOffset = (spawnDist / (69 * Math.max(0.1, Math.cos((playerPos.lat * Math.PI) / 180)))) * Math.sin(angle);
    const spawnLatLng = [playerPos.lat + latOffset, playerPos.lng + lngOffset];

    const adversaryIcon = L.divIcon({
      className: 'adversary-icon',
      html: `<div class="hunter-marker-dot" aria-label="The Hunter">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;">
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a5 5 0 110 10 5 5 0 010-10z"/>
        </svg>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    adversaryMarker = L.marker(spawnLatLng, { icon: adversaryIcon, zIndexOffset: 999, interactive: false }).addTo(map);
    adversaryDangerCircle = L.circle(spawnLatLng, {
      radius: 152, // ~500ft alarm perimeter
      color: '#dc2626',
      weight: 1.5,
      dashArray: '4 6',
      fillColor: '#ef4444',
      fillOpacity: 0.12,
      interactive: false
    }).addTo(map);
  }

  const advPos = adversaryMarker.getLatLng();
  const distMiles = calculateDistanceMiles(advPos.lat, advPos.lng, playerPos.lat, playerPos.lng);
  const distFeet = distMiles * 5280;

  if (distFeet <= 30) {
    stopGameLoop();
    playRedAlert();
    showCustomModal(
      'Caught by The Hunter',
      'The adversary intercepted your trail and ended this run. Ready for a rematch?',
      {
        hideDefaultButtons: true,
        htmlContent: `
          <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
            <button type="button" onclick="window.actionPlayAgain()" class="btn-primary btn-emerald">Play Again</button>
            <button type="button" onclick="window.actionExitToMap()" class="btn-secondary">Return to Map</button>
          </div>`
      }
    );
    return;
  }

  const speedScale = state.settings.game.adversary.speedLevel || 1;
  const mph = speedScale === 1 ? 3 : speedScale === 2 ? 6 : 12;
  const milesPerSecond = mph / 3600;
  const ratio = distMiles > 0 ? milesPerSecond / distMiles : 1;

  const nextLatLng =
    ratio >= 1
      ? [playerPos.lat, playerPos.lng]
      : [advPos.lat + (playerPos.lat - advPos.lat) * ratio, advPos.lng + (playerPos.lng - advPos.lng) * ratio];

  adversaryMarker.setLatLng(nextLatLng);
  if (adversaryDangerCircle) adversaryDangerCircle.setLatLng(nextLatLng);
}

// --- Pin Rendering ---
function createCustomIcon(iconId, isTarget = false, isFaded = false) {
  const iconObj = CACHE_ICONS.find((c) => c.id === iconId) || CACHE_ICONS[0];
  const size = isTarget ? 50 : 38;
  const classes = ['pin-bubble', isTarget ? 'pin-target' : 'pin-standard', isFaded ? 'pin-faded' : '']
    .filter(Boolean)
    .join(' ');

  return L.divIcon({
    className: 'custom-l-icon',
    html: `<div class="${classes}">${iconObj.svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function renderAllSavedPins() {
  if (!map) return;

  Object.values(mapMarkers).forEach((m) => map.removeLayer(m));
  Object.keys(mapMarkers).forEach((k) => delete mapMarkers[k]);

  const gameActive = !!state.settings.game?.isActive;
  const sortedCaches = [...state.caches].sort((a, b) =>
    state.settings.isSequential ? (a.sequenceNum || 0) - (b.sequenceNum || 0) : (a.timestamp || 0) - (b.timestamp || 0)
  );

  sortedCaches.forEach((cache, index) => {
    const isCompleted = !!cache.checkedInTime;
    const isTarget = gameActive && cache.id === state.settings.game.activeTargetId;
    const isFaded = gameActive && !isTarget && !isCompleted;

    let markerIcon;
    if (isCompleted) {
      markerIcon = L.divIcon({
        className: 'custom-l-icon-completed',
        html: `<div class="pin-bubble pin-completed"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
    } else if (state.settings.isSequential) {
      const seqNum = cache.sequenceNum || index + 1;
      const size = isTarget ? 50 : 38;
      const classes = ['pin-bubble', isTarget ? 'pin-target' : 'pin-seq', isFaded ? 'pin-faded' : '']
        .filter(Boolean)
        .join(' ');
      markerIcon = L.divIcon({
        className: 'custom-l-icon-sequence',
        html: `<div class="${classes}">${seqNum}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    } else {
      markerIcon = createCustomIcon(cache.iconId, isTarget, isFaded);
    }

    // Only allow dragging pins outside active races so running/panning never moves caches accidentally!
    const marker = L.marker([cache.lat, cache.lng], {
      icon: markerIcon,
      draggable: !gameActive,
      zIndexOffset: isTarget ? 900 : isCompleted ? 100 : 300
    }).addTo(map);

    marker.on('dragend', async (e) => {
      const pos = e.target.getLatLng();
      cache.lat = Number(pos.lat.toFixed(6));
      cache.lng = Number(pos.lng.toFixed(6));
      cache.timestamp = Date.now();
      await saveCache(cache);
      renderSequenceRoute();
      updateActiveOverlayLines();
      if (activeCacheId === cache.id && activeDrawerId === 'designer-drawer') {
        document.getElementById('cache-lat').value = cache.lat.toFixed(5);
        document.getElementById('cache-lng').value = cache.lng.toFixed(5);
      }
      showToast(`Moved "${cache.name}"`, 'info', 1600);
    });

    marker.bindPopup(
      () => {
        const safeName = escapeHtml(cache.name || 'Unnamed Cache');
        const safeDesc = escapeHtml(cache.desc || '');
        const pts = cache.points !== undefined ? cache.points : 10;
        const home = getStoredHome();
        const distMiles = home ? calculateDistanceMiles(home.lat, home.lng, cache.lat, cache.lng) : Infinity;
        const distFeet = distMiles * 5280;

        let actionHtml = '';
        if (cache.checkedInTime) {
          actionHtml = `<div class="popup-btn popup-btn-emerald" style="text-align:center; cursor:default;">Secured (+${cache.pointsAwarded || pts} pts)</div>`;
        } else if (state.settings.game?.isActive && state.settings.game?.activeTargetId === cache.id) {
          if (distFeet <= 150) {
            actionHtml = `<button type="button" onclick="window.actionCheckIn('${cache.id}')" class="popup-btn popup-btn-emerald">Check In Now</button>`;
          } else {
            actionHtml = `
              <button type="button" class="popup-btn popup-btn-muted" disabled>Move within ${formatTriggerRadius(150)} to check in</button>
              <button type="button" onclick="window.actionOverrideCheckIn('${cache.id}')" class="popup-btn popup-btn-amber">Override Check-In</button>
            `;
          }
        } else if (state.settings.game?.isActive) {
          if (state.settings.isSequential) {
            actionHtml = `<button type="button" class="popup-btn popup-btn-muted" disabled>Locked (Sequential #${cache.sequenceNum || index + 1})</button>`;
          } else {
            actionHtml = `<button type="button" onclick="window.actionTarget('${cache.id}')" class="popup-btn popup-btn-primary">Set as Active Target</button>`;
          }
        } else {
          actionHtml = `<button type="button" onclick="window.actionEdit('${cache.id}')" class="popup-btn popup-btn-primary">Edit Cache</button>`;
        }

        const secondaryEdit = state.settings.game?.isActive
          ? `<button type="button" onclick="window.actionEdit('${cache.id}')" class="popup-btn popup-btn-ghost">Edit Details</button>`
          : '';

        return `
          <div class="popup-card">
            <div class="popup-head">
              <h3 class="popup-title">${state.settings.isSequential ? `#${cache.sequenceNum || index + 1} ` : ''}${safeName}</h3>
              <span class="popup-pts">${pts} pts</span>
            </div>
            ${Number.isFinite(distMiles) ? `<div class="popup-dist">Distance: ${formatDistance(distMiles)}</div>` : ''}
            ${safeDesc ? `<p class="popup-desc">${safeDesc}</p>` : ''}
            <div class="popup-actions">
              ${actionHtml}
              ${secondaryEdit}
            </div>
          </div>
        `;
      },
      { minWidth: 220 }
    );

    // Right-click / long-press quick target lock in Free Roam
    marker.on('contextmenu', () => {
      if (state.settings.game?.isActive && !state.settings.isSequential && !cache.checkedInTime) {
        window.actionTarget(cache.id);
        if (navigator.vibrate) navigator.vibrate(40);
      }
    });

    mapMarkers[cache.id] = marker;
  });

  renderSequenceRoute();
  updateMissionHeader();
  if (activeDrawerId === 'roster-drawer') renderRoster();
}

function fitAllCachesOnMap(silentIfEmpty = false) {
  if (!map) return;
  const points = state.caches.map((c) => [c.lat, c.lng]);
  const home = getStoredHome();
  if (home) points.push([home.lat, home.lng]);

  if (points.length === 0) {
    if (!silentIfEmpty) showToast('No caches placed yet to frame.', 'info');
    return;
  }

  setFollowMode(false);
  if (points.length === 1) {
    map.flyTo(points[0], 16, { duration: 0.7 });
  } else {
    map.fitBounds(L.latLngBounds(points), { padding: [70, 90], maxZoom: 17 });
  }
}

// --- Add / Edit Cache Drawer ---
function populateIconSelector() {
  const container = document.getElementById('icon-selector');
  if (!container) return;
  container.innerHTML = '';

  CACHE_ICONS.forEach((iconObj) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-option';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(iconObj.id === selectedIconId));
    btn.setAttribute('aria-label', iconObj.label);
    btn.dataset.iconId = iconObj.id;
    btn.innerHTML = `${iconObj.svg}<span>${iconObj.label}</span>`;
    if (iconObj.id === selectedIconId) btn.classList.add('selected');

    btn.addEventListener('click', () => {
      selectedIconId = iconObj.id;
      container.querySelectorAll('.icon-option').forEach((n) => {
        const isSel = n.dataset.iconId === selectedIconId;
        n.classList.toggle('selected', isSel);
        n.setAttribute('aria-checked', String(isSel));
      });
    });

    container.appendChild(btn);
  });
}

function selectIconInUI(iconId) {
  selectedIconId = CACHE_ICONS.some((c) => c.id === iconId) ? iconId : 'box';
  document.querySelectorAll('#icon-selector .icon-option').forEach((n) => {
    const isSel = n.dataset.iconId === selectedIconId;
    n.classList.toggle('selected', isSel);
    n.setAttribute('aria-checked', String(isSel));
  });
}

function clearFormErrors() {
  const nameErr = document.getElementById('cache-name-error');
  const coordErr = document.getElementById('cache-coord-error');
  if (nameErr) nameErr.hidden = true;
  if (coordErr) coordErr.hidden = true;
}

function openAddCacheDrawer() {
  activeCacheId = null;
  clearFormErrors();

  document.getElementById('drawer-title').textContent = 'Add Geocache';
  document.getElementById('btn-delete-cache').hidden = true;
  document.getElementById('cache-name').value = '';
  document.getElementById('cache-desc').value = '';
  document.getElementById('cache-points').value = '10';

  const maxSeq = state.caches.reduce((max, c) => Math.max(max, c.sequenceNum || 0), 0);
  document.getElementById('cache-sequence').value = String(maxSeq + 1);
  document.getElementById('group-sequence-order').hidden = !state.settings.isSequential;
  document.getElementById('group-icon-selector').hidden = !!state.settings.isSequential;

  selectIconInUI('box');
  if (map) updateDraftMarker(map.getCenter(), true);
  openDrawerById('designer-drawer');
}

function openCacheForEdit(cache) {
  activeCacheId = cache.id;
  clearFormErrors();

  document.getElementById('drawer-title').textContent = 'Edit Geocache';
  document.getElementById('btn-delete-cache').hidden = false;

  if (mapMarkers[cache.id] && map) {
    map.removeLayer(mapMarkers[cache.id]);
  }

  document.getElementById('cache-name').value = cache.name || '';
  document.getElementById('cache-desc').value = cache.desc || '';
  document.getElementById('cache-lat').value = Number(cache.lat).toFixed(5);
  document.getElementById('cache-lng').value = Number(cache.lng).toFixed(5);
  document.getElementById('cache-points').value = String(cache.points !== undefined ? cache.points : 10);
  document.getElementById('cache-sequence').value = String(cache.sequenceNum || 1);

  document.getElementById('group-sequence-order').hidden = !state.settings.isSequential;
  document.getElementById('group-icon-selector').hidden = !!state.settings.isSequential;

  selectIconInUI(cache.iconId);
  updateDraftMarker({ lat: cache.lat, lng: cache.lng }, false);
  if (map) map.panTo([cache.lat, cache.lng]);
  openDrawerById('designer-drawer');
}

function updateDraftMarker(latlng, updateInputs = true) {
  if (!map) return;
  if (updateInputs) {
    document.getElementById('cache-lat').value = Number(latlng.lat).toFixed(5);
    document.getElementById('cache-lng').value = Number(latlng.lng).toFixed(5);
  }

  if (!currentCacheMarker) {
    currentCacheMarker = L.marker(latlng, { draggable: true, zIndexOffset: 1100 }).addTo(map);
    currentCacheMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      document.getElementById('cache-lat').value = pos.lat.toFixed(5);
      document.getElementById('cache-lng').value = pos.lng.toFixed(5);
    });
  } else {
    currentCacheMarker.setLatLng(latlng);
  }
}

// --- Dedicated Cache Roster & Live Scoreboard ---
function renderRoster() {
  const container = document.getElementById('scoreboard-content');
  const subtitle = document.getElementById('roster-subtitle');
  const progressFill = document.getElementById('roster-progress-fill');
  if (!container) return;

  const total = state.caches.length;
  const secured = state.caches.filter((c) => c.checkedInTime).length;
  const earnedScore = state.caches.reduce((s, c) => s + (c.checkedInTime ? c.pointsAwarded || c.points || 10 : 0), 0);
  const possible = getTotalPossibleScore();

  if (subtitle) subtitle.textContent = `${secured} of ${total} secured · ${earnedScore} / ${possible} pts`;
  if (progressFill) progressFill.style.width = total > 0 ? `${Math.round((secured / total) * 100)}%` : '0%';

  if (total === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No Caches on This Map Yet</h3>
        <p>Drop custom pins manually or scatter random caches around your area to start racing.</p>
        <div class="empty-state-actions">
          <button type="button" id="btn-empty-add" class="btn-primary">Add Cache</button>
          <button type="button" id="btn-empty-scatter" class="btn-secondary">Quick Scatter</button>
        </div>
      </div>
    `;
    const addBtn = document.getElementById('btn-empty-add');
    const scatterBtn = document.getElementById('btn-empty-scatter');
    if (addBtn) addBtn.onclick = () => openAddCacheDrawer();
    if (scatterBtn) {
      scatterBtn.onclick = () => {
        closeAllDrawers(false);
        openQuickScatterModal();
      };
    }
    return;
  }

  const home = getStoredHome();
  const sorted = [...state.caches].sort((a, b) => {
    if (rosterSortMode === 'distance' && home) {
      const da = calculateDistanceMiles(home.lat, home.lng, a.lat, a.lng);
      const db = calculateDistanceMiles(home.lat, home.lng, b.lat, b.lng);
      return da - db;
    }
    return (a.sequenceNum || 0) - (b.sequenceNum || 0) || (a.timestamp || 0) - (b.timestamp || 0);
  });

  const gameActive = !!state.settings.game?.isActive;
  const activeTargetId = state.settings.game?.activeTargetId;

  container.innerHTML = sorted
    .map((cache, idx) => {
      const isSecured = !!cache.checkedInTime;
      const isTarget = gameActive && cache.id === activeTargetId && !isSecured;
      const basePts = cache.points !== undefined ? cache.points : 10;
      const distStr = home ? formatDistance(calculateDistanceMiles(home.lat, home.lng, cache.lat, cache.lng)) : 'GPS pending';
      const safeName = escapeHtml(cache.name || 'Unnamed Cache');

      const badgeLabel = isSecured ? '✓' : state.settings.isSequential ? String(cache.sequenceNum || idx + 1) : String(idx + 1);
      const cardClass = ['roster-card', isSecured ? 'is-secured' : '', isTarget ? 'is-target' : ''].filter(Boolean).join(' ');

      const reorderControls =
        state.settings.isSequential && rosterSortMode === 'sequence' && !gameActive
          ? `
            <button type="button" class="roster-icon-btn" data-move-up="${cache.id}" aria-label="Move ${safeName} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="roster-icon-btn" data-move-down="${cache.id}" aria-label="Move ${safeName} down" ${idx === sorted.length - 1 ? 'disabled' : ''}>↓</button>
          `
          : '';

      const targetControl =
        gameActive && !isSecured && !state.settings.isSequential
          ? `<button type="button" class="roster-icon-btn ${isTarget ? '' : 'target-btn'}" data-roster-target="${cache.id}" title="Lock as active target" aria-label="Target ${safeName}">🎯</button>`
          : '';

      return `
        <div class="${cardClass}">
          <div class="roster-card-left">
            <div class="roster-seq-badge">${badgeLabel}</div>
            <div class="roster-card-meta">
              <div class="roster-card-name">${safeName}</div>
              <div class="roster-card-sub">
                ${isSecured ? `Secured · +${cache.pointsAwarded || basePts} pts` : `${basePts} pts · ${distStr}`}
              </div>
            </div>
          </div>
          <div class="roster-card-actions">
            ${reorderControls}
            <button type="button" class="roster-icon-btn" data-roster-fly="${cache.id}" title="Focus on map" aria-label="View ${safeName} on map">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:17px;height:17px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
            </button>
            ${targetControl}
            ${
              !gameActive
                ? `<button type="button" class="roster-icon-btn" data-roster-edit="${cache.id}" title="Edit cache" aria-label="Edit ${safeName}">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:17px;height:17px;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                  </button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  // Bind Roster Card Buttons
  container.querySelectorAll('[data-roster-fly]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cache = state.caches.find((c) => c.id === btn.dataset.rosterFly);
      if (cache && map) {
        closeAllDrawers(false);
        setFollowMode(false);
        map.flyTo([cache.lat, cache.lng], 17, { duration: 0.7 });
        setTimeout(() => {
          if (mapMarkers[cache.id]) mapMarkers[cache.id].openPopup();
        }, 550);
      }
    });
  });

  container.querySelectorAll('[data-roster-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.actionTarget(btn.dataset.rosterTarget);
      closeAllDrawers(false);
    });
  });

  container.querySelectorAll('[data-roster-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cache = state.caches.find((c) => c.id === btn.dataset.rosterEdit);
      if (cache) openCacheForEdit(cache);
    });
  });

  const swapSequence = async (id, direction) => {
    const ordered = [...state.caches].sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));
    const idx = ordered.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    // Normalize sequence numbers 1..N then swap
    ordered.forEach((c, i) => {
      c.sequenceNum = i + 1;
    });
    const tmp = ordered[idx].sequenceNum;
    ordered[idx].sequenceNum = ordered[swapIdx].sequenceNum;
    ordered[swapIdx].sequenceNum = tmp;
    for (const c of ordered) {
      await saveCache(c);
    }
    renderAllSavedPins();
    renderRoster();
  };

  container.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => swapSequence(btn.dataset.moveUp, -1));
  });
  container.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => swapSequence(btn.dataset.moveDown, 1));
  });
}

// --- Settings Drawer Sync ---
function syncSettingsUI() {
  document.getElementById('toggle-sequence').checked = !!state.settings.isSequential;
  document.getElementById('toggle-sound').checked = state.settings.soundEnabled !== false;
  document.getElementById('toggle-sonar').checked = !!state.settings.sonarEnabled;
  document.getElementById('toggle-voice').checked = !!state.settings.voiceEnabled;
  document.getElementById('toggle-sim-gps').checked = simGpsEnabled;

  const rad = state.settings.triggerRadiusFt || 75;
  document.getElementById('trigger-radius').value = String(rad);
  document.getElementById('trigger-radius-display').textContent = formatTriggerRadius(rad);

  applyTheme(state.settings.theme);
  applyUnitsUI(state.settings.units);
  applyMapStyle(state.settings.mapStyle || currentMapStyle, false);
}

// --- Single-Screen Quick Scatter Generator (Replaces 5 Sequential Modals!) ---
async function openQuickScatterModal() {
  const isMetric = state.settings.units === 'metric';
  const unitLabel = isMetric ? 'km' : 'mi';
  const radiusPresets = isMetric
    ? [
        { label: '0.4 km', miles: 0.25 },
        { label: '0.8 km', miles: 0.5 },
        { label: '1.5 km', miles: 0.93 },
        { label: '3 km', miles: 1.86 }
      ]
    : [
        { label: '0.25 mi', miles: 0.25 },
        { label: '0.5 mi', miles: 0.5 },
        { label: '1 mi', miles: 1 },
        { label: '2 mi', miles: 2 }
      ];

  const html = `
    <div style="display:flex; flex-direction:column; gap:14px; margin-top:8px;">
      <div class="form-group" style="margin-bottom:0;">
        <span class="field-group-label">Number of Caches</span>
        <div class="chip-group" id="scatter-count-chips">
          <button type="button" class="chip-btn" data-count="5">5</button>
          <button type="button" class="chip-btn active" data-count="10">10</button>
          <button type="button" class="chip-btn" data-count="15">15</button>
          <button type="button" class="chip-btn" data-count="25">25</button>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0;">
        <span class="field-group-label">Search Radius (${unitLabel})</span>
        <div class="chip-group" id="scatter-radius-chips">
          ${radiusPresets
            .map(
              (p, i) =>
                `<button type="button" class="chip-btn ${i === 2 ? 'active' : ''}" data-miles="${p.miles}">${p.label}</button>`
            )
            .join('')}
        </div>
      </div>

      <div class="coord-row">
        <div class="form-group" style="margin-bottom:0;">
          <label for="scatter-base-name">Base Name</label>
          <input type="text" id="scatter-base-name" value="Trail Node" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="scatter-points">Points Each</label>
          <input type="number" id="scatter-points" value="10" min="0" step="5" />
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0;">
        <label for="scatter-desc">Default Clue / Note</label>
        <input type="text" id="scatter-desc" value="Explore nearby to claim this cache." />
      </div>

      <div class="setting-row" style="padding:10px 12px; background:var(--surface-subtle); border-radius:12px;">
        <div class="setting-text">
          <label for="scatter-use-map-center" class="setting-label" style="font-size:0.86rem;">Scatter around current map view</label>
          <p class="setting-help">Off = scatter around your GPS location.</p>
        </div>
        <input type="checkbox" id="scatter-use-map-center" class="toggle-switch" ${!getStoredHome() ? 'checked' : ''} />
      </div>
    </div>
  `;

  let selectedCount = 10;
  let selectedMiles = radiusPresets[2].miles;

  setTimeout(() => {
    document.querySelectorAll('#scatter-count-chips .chip-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCount = parseInt(btn.dataset.count, 10) || 10;
        document.querySelectorAll('#scatter-count-chips .chip-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    document.querySelectorAll('#scatter-radius-chips .chip-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedMiles = parseFloat(btn.dataset.miles) || 1;
        document.querySelectorAll('#scatter-radius-chips .chip-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }, 40);

  const result = await showCustomModal(
    'Quick Scatter Caches',
    'Generate a fresh course in one tap around your location or map view.',
    {
      htmlContent: html,
      confirmText: 'Generate Caches',
      confirmClass: 'btn-primary btn-emerald'
    }
  );

  if (!result) return;

  const baseName = document.getElementById('scatter-base-name')?.value.trim() || 'Trail Node';
  const baseDesc = document.getElementById('scatter-desc')?.value.trim() || 'Explore nearby to claim this cache.';
  const basePts = Math.max(0, parseInt(document.getElementById('scatter-points')?.value, 10) || 10);
  const useMapCenter = !!document.getElementById('scatter-use-map-center')?.checked;

  const { getHomeLocation, generateRandomCaches } = await import('./random_caches.js');
  const mapCenter = map ? map.getCenter() : { lat: 39.09, lng: -96.71 };
  const origin = useMapCenter
    ? { lat: mapCenter.lat, lng: mapCenter.lng }
    : (await getHomeLocation(mapCenter)) || { lat: mapCenter.lat, lng: mapCenter.lng };

  const nextSeq = state.caches.reduce((max, c) => Math.max(max, c.sequenceNum || 0), 0) + 1;
  const generated = generateRandomCaches(
    origin.lat,
    origin.lng,
    CACHE_ICONS,
    selectedCount,
    selectedMiles,
    baseName,
    baseDesc,
    basePts,
    nextSeq
  );

  for (const cache of generated) {
    await saveCache(cache);
  }

  renderAllSavedPins();
  fitAllCachesOnMap(true);
  showToast(`Scattered ${generated.length} new caches!`, 'success');
}

// --- Adversary Hunter Mode Selector Modal ---
async function openAdversaryModal() {
  const currentLevel = state.settings.game?.adversary?.isActive ? state.settings.game.adversary.speedLevel || 1 : 0;
  const options = [
    { level: 0, title: 'Off — Classic Cache Dash', desc: 'Explore and race at your own pace with no pursuit.', badge: 'Safe' },
    { level: 1, title: 'Stalker', desc: 'Steady relentless pressure for brisk walking routes.', badge: '3 mph' },
    { level: 2, title: 'Hunter', desc: 'High-tempo chase built for runners and trail jogs.', badge: '6 mph' },
    { level: 3, title: 'Slayer', desc: 'Extreme sprint or cycling escape challenge.', badge: '12 mph' }
  ];

  const html = `
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
      ${options
        .map(
          (o) => `
          <button type="button" class="hunter-option-card ${currentLevel === o.level ? 'selected' : ''}" onclick="window.actionSetAdversary(${o.level})">
            <div>
              <span class="hunter-option-title">${o.title}</span>
              <span class="hunter-option-desc">${o.desc}</span>
            </div>
            <span class="hunter-speed-pill">${o.badge}</span>
          </button>`
        )
        .join('')}
    </div>
  `;

  await showCustomModal(
    'Adversary Mode (The Hunter)',
    'Enable a hostile pursuer that spawns nearby and tracks your GPS during active races. If it catches you within 30 ft, the run ends.',
    { hideDefaultButtons: true, htmlContent: html }
  );
}

// --- Onboarding / Boot Welcome ---
async function runBootSequence() {
  if (state.caches.length > 0) return;
  if (sessionStorage.getItem('cachedash_welcomed') === '1') return;
  sessionStorage.setItem('cachedash_welcomed', '1');

  await showCustomModal(
    'Welcome to Cache Dash',
    'Create a local geocaching adventure, scatter instant caches around you, or import a friend’s <code>.gcache</code> map. Everything runs 100% locally on your device.',
    {
      hideDefaultButtons: true,
      htmlContent: `
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
          <button type="button" onclick="window.bootQuickScatter()" class="btn-primary btn-emerald">Quick Scatter Near Me</button>
          <button type="button" onclick="window.bootNewMap()" class="btn-primary">Create Custom Mission</button>
          <button type="button" onclick="window.actionLoadNewMap()" class="btn-secondary">Import .gcache Map File</button>
        </div>`
    }
  );
}

// --- Global Interactive Actions (Popups & Modals) ---
window.bootQuickScatter = () => {
  dismissActiveModal();
  setTimeout(() => openQuickScatterModal(), 120);
};

window.bootNewMap = async () => {
  dismissActiveModal();
  const result = await showCustomModal(
    'New Mission Setup',
    'Give your geocaching course a goal, optional story briefing, and optional countdown limit.',
    {
      showInput: true,
      inputLabel: 'Mission Goal Title',
      inputValue: state.settings.narrativeGoal || 'Find the hidden treasures around town!',
      showStory: true,
      storyValue: state.settings.narrativeStory || '',
      showTimeInfo: true,
      timeValue: state.settings.targetTimeMinutes || 0,
      confirmText: 'Save Mission'
    }
  );

  if (result && result.text.trim()) {
    await saveSettings({
      narrativeGoal: result.text.trim(),
      narrativeStory: (result.story || '').trim(),
      targetTimeMinutes: result.timeMinutes
    });
    updateMissionHeader();
    showToast('Mission saved! Tap Add or Scatter to place caches.', 'success');
  }
};

window.actionSetAdversary = async (advSpeed) => {
  dismissActiveModal();
  const isActive = advSpeed > 0;
  if (!isActive) despawnAdversary();

  await saveSettings({
    game: {
      ...state.settings.game,
      adversary: {
        ...state.settings.game.adversary,
        isActive,
        speedLevel: advSpeed
      }
    }
  });

  updateMissionHeader();
  updateDistanceBadge();

  const labels = { 1: 'Stalker (3 mph)', 2: 'Hunter (6 mph)', 3: 'Slayer (12 mph)' };
  showToast(isActive ? `Adversary armed: ${labels[advSpeed]}` : 'Adversary disabled (Classic Mode)', isActive ? 'warning' : 'info');
};

window.actionEdit = (id) => {
  if (map) map.closePopup();
  const cache = state.caches.find((c) => c.id === id);
  if (cache) openCacheForEdit(cache);
};

window.actionTarget = async (id) => {
  if (map) map.closePopup();
  const cache = state.caches.find((c) => c.id === id);
  if (!cache || cache.checkedInTime) return;

  await saveSettings({
    game: {
      ...state.settings.game,
      activeTargetId: id
    }
  });

  updateDistanceBadge();
  updateActiveOverlayLines();
  renderAllSavedPins();
  showToast(`Target locked: ${cache.name}`, 'info', 1800);
};

window.actionOverrideCheckIn = async (id) => {
  if (map) map.closePopup();
  const confirmed = await showCustomModal(
    'Override Check-In?',
    'Mark this cache as secured manually even though you are outside the GPS capture ring?',
    { confirmText: 'Secure Anyway', confirmClass: 'btn-amber' }
  );
  if (confirmed) {
    await window.actionCheckIn(id);
  }
};

window.actionCheckIn = async (id) => {
  if (map) map.closePopup();
  const cache = state.caches.find((c) => c.id === id);
  if (!cache || cache.checkedInTime) return;

  const now = Date.now();
  const basePoints = cache.points !== undefined ? cache.points : 10;
  let combo = 1;

  if (state.settings.game?.lastCheckinTime) {
    const elapsedSeconds = Math.floor((now - state.settings.game.lastCheckinTime) / 1000);
    if (elapsedSeconds <= 45) combo = 3;
    else if (elapsedSeconds <= 90) combo = 2;
  }

  const points = basePoints * combo;
  cache.checkedInTime = now;
  cache.pointsAwarded = points;
  await saveCache(cache);

  const newScore = (state.settings.game?.score || 0) + points;
  const bestCombo = Math.max(state.settings.game?.bestCombo || 1, combo);

  await saveSettings({
    game: {
      ...state.settings.game,
      activeTargetId: null,
      score: newScore,
      bestCombo,
      lastCheckinTime: now
    }
  });

  playCaptureChime(combo);
  if (navigator.vibrate) navigator.vibrate([40, 40, 80]);

  const checkedInCount = state.caches.filter((c) => c.checkedInTime).length;
  const allComplete = checkedInCount >= state.caches.length && state.caches.length > 0;

  if (allComplete) {
    // CRITICAL FIX: Stop game loop & Hunter immediately on victory!
    const startTime = state.settings.game?.startTime || now;
    const elapsedTotal = Math.max(1, Math.floor((now - startTime) / 1000));
    const h = Math.floor(elapsedTotal / 3600);
    const m = Math.floor((elapsedTotal % 3600) / 60);
    const s = elapsedTotal % 60;
    const timeLabel = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
    const ptsPerMin = (newScore / (elapsedTotal / 60)).toFixed(1);

    await stopGameLoop();
    playVictoryFanfare();
    speakLocal(`Course complete! Final score ${newScore} points in ${timeLabel}.`);

    const summaryText = `I conquered "${state.settings.narrativeGoal || 'Cache Dash'}" in Cache Dash!\nScore: ${newScore} pts\nTime: ${timeLabel}\nPace: ${ptsPerMin} pts/min\nBest Combo: ${bestCombo}x`;
    window._lastVictoryShareText = summaryText;

    setTimeout(() => {
      showCustomModal(
        'Course Complete!',
        `You secured all <strong>${state.caches.length}</strong> caches in <strong>${escapeHtml(state.settings.narrativeGoal)}</strong>.`,
        {
          hideDefaultButtons: true,
          htmlContent: `
            <div class="victory-grid">
              <div class="victory-stat"><span class="victory-stat-value">${newScore}</span><span class="victory-stat-label">Final Score</span></div>
              <div class="victory-stat"><span class="victory-stat-value">${timeLabel}</span><span class="victory-stat-label">Total Time</span></div>
              <div class="victory-stat"><span class="victory-stat-value">${ptsPerMin}</span><span class="victory-stat-label">Pts / Min</span></div>
              <div class="victory-stat"><span class="victory-stat-value">${bestCombo}x</span><span class="victory-stat-label">Peak Combo</span></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
              <button type="button" onclick="window.actionShareResults()" class="btn-amber">Share Results</button>
              <button type="button" onclick="window.actionPlayAgain()" class="btn-primary btn-emerald">Play Again</button>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <button type="button" onclick="window.actionLoadNewMap()" class="btn-secondary">Import Map</button>
                <button type="button" onclick="window.actionExitToMap()" class="btn-secondary">Back to Map</button>
              </div>
            </div>
          `
        }
      );
    }, 350);
    return;
  }

  // Announce capture & auto-chain to next target (respects Sequential Mode)
  const comboNote = combo > 1 ? ` (${combo}x combo!)` : '';
  showToast(`Secured "${cache.name}" +${points} pts${comboNote}`, 'success', 2600);
  speakLocal(`Secured ${cache.name}. ${cache.desc || ''}`);

  const nextId = pickNextTargetId();
  if (nextId) {
    await saveSettings({
      game: {
        ...state.settings.game,
        activeTargetId: nextId
      }
    });
  }

  renderAllSavedPins();
  updateDistanceBadge();
  updateActiveOverlayLines();
};

window.actionPlayAgain = async () => {
  dismissActiveModal();
  await startGameLoop(false);
};

window.actionLoadNewMap = () => {
  dismissActiveModal();
  document.getElementById('locus-file-import')?.click();
};

window.actionExitToMap = () => {
  dismissActiveModal();
};

window.actionShareResults = async () => {
  const shareText =
    window._lastVictoryShareText ||
    `I completed "${state.settings.narrativeGoal || 'Cache Dash'}" in Cache Dash!`;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (isMobile && navigator.share) {
    try {
      await navigator.share({ title: 'Cache Dash Results', text: shareText });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareText);
      showToast('Results copied to clipboard!', 'success');
      return;
    }
  } catch (_) {}

  // Legacy fallback
  const ta = document.createElement('textarea');
  ta.value = shareText;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  showToast(ok ? 'Results copied to clipboard!' : 'Could not copy results automatically.', ok ? 'success' : 'error');
};

window.actionProceedExport = async (mode) => {
  const inputEl = document.getElementById('export-filename-input');
  const finalName = inputEl?.value.trim() || 'cachedash_map';
  dismissActiveModal();

  try {
    const { exportCaches } = await import('./export.js');
    const res = await exportCaches(finalName, mode);
    if (res?.status === 'downloaded') showToast(`Saved ${res.fileName}`, 'success');
    else if (res?.status === 'shared') showToast(`Shared ${res.fileName}`, 'success');
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
  }
};

// --- Bootstrap & Event Wiring ---
document.addEventListener('DOMContentLoaded', async () => {
  populateIconSelector();
  await initMap();

  // Global Escape key closes modal first, then active drawer
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('custom-modal');
    if (modal && modal.classList.contains('open')) {
      dismissActiveModal();
    } else if (activeDrawerId) {
      closeAllDrawers(true);
    }
  });

  // Shared Drawer Close Triggers
  document.getElementById('drawer-backdrop')?.addEventListener('click', () => closeAllDrawers(true));
  document.querySelectorAll('[data-close-drawer]').forEach((btn) => {
    btn.addEventListener('click', () => closeAllDrawers(true));
  });

  // Header Actions
  const openEditGoalModal = async () => {
    const result = await showCustomModal('Mission Goal & Story', 'Customize the mission briefing and optional countdown limit.', {
      showInput: true,
      inputLabel: 'Mission Goal Title',
      inputValue: state.settings.narrativeGoal || '',
      showStory: true,
      storyValue: state.settings.narrativeStory || '',
      showTimeInfo: true,
      timeValue: state.settings.targetTimeMinutes || 0,
      confirmText: 'Save Changes'
    });

    if (result && result.text.trim()) {
      await saveSettings({
        narrativeGoal: result.text.trim(),
        narrativeStory: (result.story || '').trim(),
        targetTimeMinutes: result.timeMinutes
      });
      updateMissionHeader();
      showToast('Mission updated', 'success', 2000);
    }
  };

  document.getElementById('btn-edit-narrative')?.addEventListener('click', openEditGoalModal);
  document.getElementById('btn-narrative-title')?.addEventListener('click', openEditGoalModal);

  document.getElementById('btn-read-story')?.addEventListener('click', () => {
    showCustomModal(
      state.settings.narrativeGoal || 'Mission Story',
      `<p style="white-space:pre-line;">${escapeHtml(state.settings.narrativeStory || '')}</p>`,
      { hideCancel: true, confirmText: 'Got It' }
    );
  });

  document.getElementById('btn-import-map')?.addEventListener('click', () => {
    document.getElementById('locus-file-import')?.click();
  });

  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    if (state.caches.length === 0) {
      showToast('Add at least one cache before exporting a map.', 'warning');
      return;
    }
    const defaultName = (state.settings.narrativeGoal || 'cachedash_map')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    await showCustomModal('Export Map (.gcache)', 'Save your caches and mission settings to share or back up locally.', {
      hideDefaultButtons: true,
      htmlContent: `
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
          <div class="form-group" style="margin-bottom:4px;">
            <label for="export-filename-input">File Name</label>
            <input type="text" id="export-filename-input" value="${escapeHtml(defaultName || 'cachedash_map')}" />
          </div>
          <button type="button" onclick="window.actionProceedExport('local')" class="btn-primary">Download .gcache File</button>
          ${isMobile ? `<button type="button" onclick="window.actionProceedExport('cloud')" class="btn-primary btn-emerald">Share via OS Sheet / Drive</button>` : ''}
        </div>`
    });
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => openDrawerById('settings-drawer'));

  document.getElementById('btn-show-help')?.addEventListener('click', () => {
    showCustomModal('Cache Dash Field Guide', `<div class="markdown-body">${marked.parse(faqRaw)}</div>`, {
      hideCancel: true,
      confirmText: 'Close Guide'
    });
  });

  // Map Utility Rail
  document.getElementById('btn-map-toggle')?.addEventListener('click', () => window.toggleMapLayer());
  document.getElementById('btn-fit-caches')?.addEventListener('click', () => fitAllCachesOnMap(false));

  // Fixed Single Click-Listener for My Location / Follow Toggle!
  setFollowMode(true);
  document.getElementById('btn-my-location')?.addEventListener('click', async () => {
    if (window.isAutoCenter) {
      setFollowMode(false);
      showToast('Map follow paused — pan freely', 'info', 1600);
      return;
    }

    setFollowMode(true);
    const known = currentLocationMarker?.getLatLng() || getStoredHome();
    if (known && map) {
      map.flyTo([known.lat, known.lng], Math.max(map.getZoom(), 16), { duration: 0.65 });
      showToast('Following your location', 'info', 1600);
      return;
    }

    showGpsPill('Acquiring GPS signal…');
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      const { latitude, longitude, accuracy } = pos.coords;
      setStoredHome(latitude, longitude);
      updateUserLocationMarker(latitude, longitude, accuracy);
      map.flyTo([latitude, longitude], 16, { duration: 0.7 });
      hideGpsPill();
    } catch (_) {
      hideGpsPill();
      showToast('GPS unavailable — enable Location or use Indoor Test Mode in Settings.', 'warning', 3800);
    }
  });

  // Bottom Command Dock (Pre-Game)
  document.getElementById('btn-add-cache')?.addEventListener('click', openAddCacheDrawer);
  document.getElementById('btn-generate-random')?.addEventListener('click', openQuickScatterModal);
  document.getElementById('btn-play-game')?.addEventListener('click', () => startGameLoop(false));
  document.getElementById('btn-adversary-mode')?.addEventListener('click', openAdversaryModal);
  document.getElementById('btn-open-roster')?.addEventListener('click', () => openDrawerById('roster-drawer'));

  // Active Gameplay Controls
  document.getElementById('btn-active-roster')?.addEventListener('click', () => openDrawerById('roster-drawer'));
  document.getElementById('btn-stop-game')?.addEventListener('click', async () => {
    const confirmed = await showCustomModal('Stop Current Race?', 'Pause and return to the mission map? Your current run timer will stop.', {
      confirmText: 'Stop Race',
      confirmClass: 'btn-danger'
    });
    if (confirmed) {
      await stopGameLoop();
      showToast('Race stopped', 'info', 1800);
    }
  });

  document.getElementById('btn-hud-sonar')?.addEventListener('click', async () => {
    const next = !state.settings.sonarEnabled;
    await saveSettings({ sonarEnabled: next });
    const btn = document.getElementById('btn-hud-sonar');
    if (btn) btn.setAttribute('aria-pressed', String(next));
    if (next) {
      scheduleSonarPing();
      showToast('Warm/Cold proximity sonar ON', 'info', 1800);
    } else {
      stopSonarLoop();
      showToast('Proximity sonar muted', 'info', 1800);
    }
  });

  // Cache Designer Form
  document.getElementById('btn-cancel-cache')?.addEventListener('click', () => closeAllDrawers(true));

  document.getElementById('btn-coord-gps')?.addEventListener('click', () => {
    const home = getStoredHome();
    if (!home) {
      showToast('No GPS fix yet — using map center.', 'warning');
      if (map) updateDraftMarker(map.getCenter(), true);
      return;
    }
    updateDraftMarker(home, true);
    if (map) map.panTo([home.lat, home.lng]);
  });

  document.getElementById('btn-coord-center')?.addEventListener('click', () => {
    if (map) updateDraftMarker(map.getCenter(), true);
  });

  const syncCoordInputs = () => {
    const lat = parseFloat(document.getElementById('cache-lat').value);
    const lng = parseFloat(document.getElementById('cache-lng').value);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      updateDraftMarker({ lat, lng }, false);
      if (map) map.panTo([lat, lng]);
    }
  };
  document.getElementById('cache-lat')?.addEventListener('input', syncCoordInputs);
  document.getElementById('cache-lng')?.addEventListener('input', syncCoordInputs);

  document.getElementById('cache-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors();

    const name = document.getElementById('cache-name').value.trim();
    const desc = document.getElementById('cache-desc').value.trim();
    const lat = parseFloat(document.getElementById('cache-lat').value);
    const lng = parseFloat(document.getElementById('cache-lng').value);
    const pts = Math.max(0, parseInt(document.getElementById('cache-points').value, 10) || 10);
    const seq = parseInt(document.getElementById('cache-sequence').value, 10);

    if (!name) {
      const err = document.getElementById('cache-name-error');
      err.textContent = 'Please enter a name for this cache.';
      err.hidden = false;
      document.getElementById('cache-name').focus();
      return;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      const err = document.getElementById('cache-coord-error');
      err.textContent = 'Enter valid latitude (-90 to 90) and longitude (-180 to 180).';
      err.hidden = false;
      document.getElementById('cache-lat').focus();
      return;
    }

    let finalSeq = Number.isFinite(seq) && seq > 0 ? seq : state.caches.length + 1;
    if (state.settings.isSequential) {
      const duplicate = state.caches.find((c) => c.sequenceNum === finalSeq && c.id !== activeCacheId);
      if (duplicate) {
        showToast(`Sequence #${finalSeq} is already used by "${duplicate.name}".`, 'error');
        document.getElementById('cache-sequence').focus();
        return;
      }
    }

    const existing = activeCacheId ? state.caches.find((c) => c.id === activeCacheId) : null;
    const payload = {
      ...(existing || {}),
      id: activeCacheId || `CACHE_${Date.now()}`,
      name,
      desc,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      iconId: selectedIconId,
      sequenceNum: finalSeq,
      points: pts,
      timestamp: existing?.timestamp || Date.now()
    };

    await saveCache(payload);
    const wasEdit = !!activeCacheId;
    closeAllDrawers(true);
    renderAllSavedPins();
    showToast(wasEdit ? `Updated "${name}"` : `Added "${name}"`, 'success');
  });

  document.getElementById('btn-delete-cache')?.addEventListener('click', async () => {
    if (!activeCacheId) return;
    const target = state.caches.find((c) => c.id === activeCacheId);
    const confirmed = await showCustomModal(
      'Delete Cache?',
      `Remove <strong>${escapeHtml(target?.name || 'this cache')}</strong> from your map?`,
      { confirmText: 'Delete', confirmClass: 'btn-danger' }
    );
    if (confirmed) {
      await deleteCache(activeCacheId);
      closeAllDrawers(true);
      renderAllSavedPins();
      showToast('Cache deleted', 'info');
    }
  });

  // Roster Controls
  document.querySelectorAll('[data-roster-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      rosterSortMode = btn.dataset.rosterSort;
      document.querySelectorAll('[data-roster-sort]').forEach((b) => b.classList.toggle('active', b === btn));
      renderRoster();
    });
  });

  document.getElementById('btn-roster-add')?.addEventListener('click', () => openAddCacheDrawer());

  // Settings Controls
  document.getElementById('toggle-sequence')?.addEventListener('change', async (e) => {
    await saveSettings({ isSequential: e.target.checked });
    // Ensure every cache has a unique sequence number when enabling sequential mode
    if (e.target.checked) {
      const sorted = [...state.caches].sort((a, b) => (a.sequenceNum || 9999) - (b.sequenceNum || 9999));
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].sequenceNum = i + 1;
        await saveCache(sorted[i]);
      }
    }
    renderAllSavedPins();
    updateMissionHeader();
  });

  const radiusSlider = document.getElementById('trigger-radius');
  const radiusDisplay = document.getElementById('trigger-radius-display');
  radiusSlider?.addEventListener('input', (e) => {
    if (radiusDisplay) radiusDisplay.textContent = formatTriggerRadius(parseInt(e.target.value, 10));
  });
  radiusSlider?.addEventListener('change', async (e) => {
    await saveSettings({ triggerRadiusFt: parseInt(e.target.value, 10) || 75 });
    updateActiveOverlayLines();
  });

  document.getElementById('toggle-sound')?.addEventListener('change', async (e) => {
    await saveSettings({ soundEnabled: e.target.checked });
    if (!e.target.checked) stopSonarLoop();
  });

  document.getElementById('toggle-sonar')?.addEventListener('change', async (e) => {
    await saveSettings({ sonarEnabled: e.target.checked });
    if (e.target.checked && state.settings.game?.isActive) scheduleSonarPing();
    else stopSonarLoop();
  });

  document.getElementById('toggle-voice')?.addEventListener('change', async (e) => {
    await saveSettings({ voiceEnabled: e.target.checked });
    if (e.target.checked) speakLocal('Local voice guidance enabled.');
  });

  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.themeChoice;
      applyTheme(theme);
      await saveSettings({ theme });
    });
  });

  document.querySelectorAll('[data-units-choice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const units = btn.dataset.unitsChoice;
      await saveSettings({ units });
      applyUnitsUI(units);
    });
  });

  document.querySelectorAll('[data-map-choice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const style = btn.dataset.mapChoice;
      applyMapStyle(style, false);
      await saveSettings({ mapStyle: style });
    });
  });

  document.getElementById('toggle-sim-gps')?.addEventListener('change', (e) => {
    simGpsEnabled = e.target.checked;
    updateMissionHeader();
    showToast(
      simGpsEnabled ? 'Indoor Test Mode ON: click map during a race to walk.' : 'Indoor Test Mode OFF',
      'info',
      2800
    );
  });

  document.getElementById('btn-reset-progress')?.addEventListener('click', async () => {
    const confirmed = await showCustomModal(
      'Reset Run Progress?',
      'Keep all caches on your map, but clear secured check-ins and reset your score to 0?',
      { confirmText: 'Reset Progress' }
    );
    if (!confirmed) return;

    await stopGameLoop();
    for (const c of state.caches) {
      if (c.checkedInTime || c.pointsAwarded) {
        c.checkedInTime = null;
        c.pointsAwarded = 0;
        await saveCache(c);
      }
    }
    await saveSettings({
      game: { ...state.settings.game, score: 0, bestCombo: 1, activeTargetId: null, lastCheckinTime: null }
    });
    closeAllDrawers(false);
    renderAllSavedPins();
    showToast('Run progress reset', 'success');
  });

  document.getElementById('btn-delete-all')?.addEventListener('click', async () => {
    const confirmed = await showCustomModal(
      'Delete All Caches?',
      'Permanently delete <strong>all caches</strong> and reset your mission settings? This cannot be undone.',
      { confirmText: 'Delete Everything', confirmClass: 'btn-danger' }
    );
    if (!confirmed) return;

    await stopGameLoop();
    await deleteAllCaches();

    const fresh = createDefaultSettings();
    fresh.theme = state.settings.theme;
    fresh.units = state.settings.units;
    fresh.mapStyle = state.settings.mapStyle;
    await saveSettings(fresh);

    closeAllDrawers(false);
    if (map) map.closePopup();
    renderAllSavedPins();
    updateMissionHeader();
    showToast('All local caches cleared', 'info');
  });

  // File Import (.gcache & open JSON)
  document.getElementById('locus-file-import')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { importCaches } = await import('./import.js');
      const { count, settings: imp, verified } = await importCaches(file);

      await stopGameLoop();
      await saveSettings({
        narrativeGoal: imp.narrativeGoal || file.name.replace(/\.(gcache|json)$/i, ''),
        narrativeStory: imp.narrativeStory || '',
        isSequential: Boolean(imp.isSequential),
        targetTimeMinutes: Number(imp.targetTimeMinutes) || 0,
        triggerRadiusFt: Number(imp.triggerRadiusFt) || state.settings.triggerRadiusFt || 75,
        game: {
          ...createDefaultSettings().game,
          adversary: imp.game?.adversary || createDefaultSettings().game.adversary
        }
      });

      closeAllDrawers(false);
      if (map) map.closePopup();
      renderAllSavedPins();
      updateMissionHeader();
      fitAllCachesOnMap(true);

      showToast(
        `Loaded ${count} ${count === 1 ? 'cache' : 'caches'}${verified ? ' (verified)' : ''}!`,
        'success',
        3200
      );
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error', 4500);
    } finally {
      e.target.value = '';
    }
  });

  // Initial Map Centering
  const savedHome = getStoredHome();
  if (savedHome) {
    map.setView([savedHome.lat, savedHome.lng], 14);
    updateUserLocationMarker(savedHome.lat, savedHome.lng);
  } else if (state.caches.length > 0) {
    fitAllCachesOnMap(true);
  }

  // Trigger clean first-run welcome only if map is empty
  setTimeout(() => runBootSequence(), 220);

  // Register Service Worker for Offline Caching
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration skipped:', err);
      });
    });
  }
});
