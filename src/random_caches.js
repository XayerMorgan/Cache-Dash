export async function getHomeLocation() {
  let home = localStorage.getItem('locus_home');
  if (home) return JSON.parse(home);

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    localStorage.setItem('locus_home', JSON.stringify(loc));
    return loc;
  } catch (err) {
    // Prompt fallback if geolocation fails or is denied
    const input = prompt("Could not detect location. Please enter your home Lat, Lng (e.g., 34.05, -118.24):");
    if (input) {
      const parts = input.split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          const loc = { lat, lng };
          localStorage.setItem('locus_home', JSON.stringify(loc));
          return loc;
        }
      }
    }
  }
  return null;
}

export function generateRandomCaches(centerLat, centerLng, cacheIcons, count = 10, radiusMiles = 1, baseName = "Random Cache", baseDesc = "Auto-generated cache near your location.", basePts = 10) {
  const generated = [];
  const radiusDeg = radiusMiles / 69; // Rough conversion: 1 degree latitude ~= 69 miles

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    // Math.sqrt(Math.random()) distributes points uniformly over the area of the circle
    const r = radiusDeg * Math.sqrt(Math.random()); 
    const dLat = r * Math.sin(angle);
    // Longitude degree distance shrinks with cosine of latitude
    const dLng = (r * Math.cos(angle)) / Math.cos(centerLat * Math.PI / 180);
    
    // Pick random icon
    const iconId = cacheIcons[Math.floor(Math.random() * cacheIcons.length)].id;
    
    generated.push({
      id: "RND_" + Date.now().toString() + "_" + i,
      name: `${baseName} #${Math.floor(Math.random() * 1000)}`,
      desc: baseDesc,
      points: basePts,
      lat: centerLat + dLat,
      lng: centerLng + dLng,
      iconId: iconId,
      timestamp: Date.now()
    });
  }
  return generated;
}
