# Cache Dash — Field Guide

Welcome to **Cache Dash**, a privacy-first, offline-capable geocaching and outdoor racing app. All GPS tracking, maps, and scores run locally on your device.

---

## Gameplay Basics

### How do I play?
1. Enable Location Services on your device (or toggle **Indoor Test Mode** in **Rules & Settings** to click-to-walk indoors).
2. Tap **Add** in the bottom dock to drop custom caches, or tap **Scatter** to generate an instant random course in one step.
3. Tap **Start** to launch the Tactical HUD.
4. Follow the rotating compass arrow, bearing, and dashed target tether line to each golden beacon.
5. Walk within the **Auto-Trigger Distance** (default **75 ft / 23 m**) to trigger the hands-free capture countdown, or tap the green **Check In** banner when within 150 ft.

### Scoring & Combos
Every cache has a custom point value. Fast captures chain into live score multipliers shown in the HUD:
- **Base Points:** Standard capture value.
- **2x Combo:** Captured within **90 seconds** of the previous cache.
- **3x Combo:** Captured within **45 seconds** of the previous cache.

### Sequential Mode
Enable **Enforce Sequential Order** inside **Rules & Settings** to turn your map into a numbered route (`1 → 2 → 3`) with dashed trail connectors. You can reorder stops anytime using the up/down buttons inside the **Roster** drawer.

---

## Maps, Sharing & Open `.gcache` Format

### Sharing & Importing Maps
- Tap the **Export** button in the top bar to save a checksum-verified `.gcache` file (or share via your mobile OS Share Sheet).
- Tap **Import** to load any `.gcache` or open `.json` cache file. Cache Dash restores the mission title, story, sequential rules, and frames the map automatically.

### Map Styles & Themes
- Use the right-hand rail to cycle between **Street**, **Satellite**, and **Topographic** maps, toggle **Follow Location**, or **Fit All Caches**.
- Switch between **Daylight** and **Night** themes or **ft / mi** and **m / km** inside **Rules & Settings**.

---

## Adversary Mode (The Hunter)

Tap **Hunter** in the bottom dock to activate a hostile pursuer during active races:
- **Stalker:** ~3 mph (brisk walking pace)
- **Hunter:** ~6 mph (jogging pace)
- **Slayer:** ~12 mph (sprint / cycling pace)

If The Hunter closes within **500 ft**, your HUD flashes red and emits a proximity alarm. If it catches you within **30 ft**, the run ends immediately.

---

## Field Audio & Privacy

- **Warm / Cold Proximity Sonar:** Toggle the speaker icon in the active HUD (or in Settings) for an audio sonar ping that speeds up and rises in pitch as you get closer.
- **Local Voice Announcements:** Optional offline text-to-speech reads cache names and clues when you arrive.
- **100% Local Privacy:** Zero cloud tracking or servers. Everything stays in your browser's local `IndexedDB`.
