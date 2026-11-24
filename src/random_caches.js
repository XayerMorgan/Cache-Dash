export async function getHomeLocation(fallbackLatLng = null) {
  const home = localStorage.getItem('locus_home');
  if (home) {
    try {
      const parsed = JSON.parse(home);
      if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lng)) {
        return parsed;
      }
    } catch (_) {}
  }

  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation unavailable'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000
      });
    });
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    localStorage.setItem('locus_home', JSON.stringify(loc));
    return loc;
  } catch (_) {
    if (fallbackLatLng && Number.isFinite(fallbackLatLng.lat) && Number.isFinite(fallbackLatLng.lng)) {
      return { lat: fallbackLatLng.lat, lng: fallbackLatLng.lng };
    }
  }
  return null;
}

export function generateRandomCaches(
  centerLat,
  centerLng,
  cacheIcons,
  count = 10,
  radiusMiles = 1,
  baseName = 'Secret Node',
  baseDesc = 'Auto-generated geocache in your area.',
  basePts = 10,
  startingSequence = 1
) {
  const generated = [];
  const radiusDeg = radiusMiles / 69;
  const cosLat = Math.max(0.1, Math.cos((centerLat * Math.PI) / 180));
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    // Keep drops between 12% and 100% of radius so they don't all stack right on top of the player
    const r = radiusDeg * (0.12 + 0.88 * Math.sqrt(Math.random()));
    const dLat = r * Math.sin(angle);
    const dLng = (r * Math.cos(angle)) / cosLat;

    const iconId = cacheIcons[Math.floor(Math.random() * cacheIcons.length)].id;

    generated.push({
      id: `RND_${now}_${i}`,
      name: `${baseName} #${startingSequence + i}`,
      desc: baseDesc,
      points: basePts,
      lat: Number((centerLat + dLat).toFixed(6)),
      lng: Number((centerLng + dLng).toFixed(6)),
      iconId,
      sequenceNum: startingSequence + i,
      timestamp: now + i
    });
  }
  return generated;
}
