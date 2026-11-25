# Cache Dash (Locus)

Cache Dash is a privacy-first, offline geocaching and outdoor racing app. The Capacitor shell is named **Locus** (`com.locus.geocache`). GPS, maps, scores, and missions stay on the device in IndexedDB. There is no account and no backend.

## Features

- Drop custom caches or scatter a random course around your GPS fix or the current map view
- Tactical HUD with compass bearing, distance, and a dashed target line
- Hands-free check-in inside the trigger radius, plus score combos
- Optional sequential routes, day/night theme, and imperial or metric units
- Street, satellite, and topographic maps
- Adversary mode (Stalker, Hunter, Slayer) and warm/cold sonar with optional local text-to-speech
- Indoor test mode: click the map to walk a course without GPS
- Export and import checksummed `.gcache` files (plain JSON)

## Tech stack

- [Vite](https://vite.dev/) for the web app
- [Leaflet](https://leafletjs.com/) for the map
- [Capacitor](https://capacitorjs.com/) 8 for Android and iOS shells
- Local persistence via IndexedDB (`LocusDB`)

## Run and build (web)

Requires Node.js and npm.

```bash
npm ci
npm run dev       # local dev server
npm run build     # production build
npm run preview   # serve the production build
```

`npm run build` runs `vite build` and writes the site to **`dist/`**. That directory is the publish folder for a Netlify deploy (`npm run build`, publish `dist`). `public/_redirects` is copied into `dist` so client routes fall back to `index.html`.

## Android

After a web build, sync the Capacitor project and open it in Android Studio (Android SDK required):

```bash
npm run build
npx cap sync android
npx cap open android
```

From Android Studio, run the `app` configuration on a device or emulator. A debug APK can also be built with the Gradle wrapper once the SDK is installed:

```bash
cd android && ./gradlew assembleDebug
```

The iOS project under `ios/` syncs the same way (`npx cap sync ios`) and needs Xcode on macOS.

## Map tiles

| Style | Source |
| --- | --- |
| Street | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors |
| Satellite | Tiles © [Esri](https://www.esri.com/) — World Imagery |
| Topographic | © [OpenTopoMap](https://opentopomap.org/) (OSM data) |

The default map view (`39.09, -96.71`) is a generic continental-US center used only until GPS or a saved course is available. It is not a home location.

## License

[MIT](LICENSE) © 2026 Matthew Jett Hall
