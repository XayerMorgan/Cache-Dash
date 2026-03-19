# Cache Dash - FAQ

Welcome to **Cache Dash**, an offline-capable, web-based geocaching and location-tracking racing game! 

Here are some frequently asked questions to help you get started building maps, exploring your neighborhood, and racing for the high score.

---

## 🎮 Gameplay Basics

### **How do I play?**
1. Ensure your device's GPS and Location Services are enabled.
2. Tap the **+** (Add Cache) button to manually drop points on the map, or use the **Dice** (Random Generator) to automatically place caches around you.
3. Tap the big **Play** button!
4. Walk, run, or bike to the hidden locations on your map. 
5. When you get close enough to a cache, you will automatically capture it and score points!

### **Do I need to tap anything when I find a cache?**
No! If you have the game running (Play button clicked), the app tracks your distance dynamically in the background. If you walk within the "Auto-Trigger Distance" (default is 75 feet) of the active cache, it instantly checks you in, rings the bell, and gives you the points completely hands-free.

### **How many points do I get per cache?**
When making a map, you can assign custom Point Values to every cache. The amount of points you actually *earn*, however, depends on your speed:
- **Base Points:** The standard amount assigned to the cache.
- **2x Combo Hit:** Captured within 90 seconds of the previous cache.
- **3x Combo Hit!!!:** Captured within 45 seconds of the previous cache.
*Gotta go fast!*

### **What happens when I finish a map?**
When you capture the final cache, the timer stops, and you are presented with a Victory Screen displaying your total time and final accumulated score. You can tap **Share Results** to instantly copy your stats to your clipboard and brag to your friends!

---

## 🗺️ Custom Maps & Sharing

### **How do I share a map I created with a friend?**
It's super easy! 
1. Build your map by dropping pins.
2. At the top of the screen, tap the **Export** (Cloud/Arrow) button.
3. Type a name for your map. 
4. Tap **Save to Device** (downloads a `.gcache` file to your PC/Phone) or **Save to Google Drive / Cloud** (opens your phone's native Share Sheet to beam it via AirDrop, Messages, or Google Drive).
5. Send that `.gcache` file to your friend!

### **How do I play my friend's map?**
1. Download the `.gcache` file they sent you to your phone or computer.
2. Open Cache Dash.
3. Tap the **Folder / Import Map** icon at the top of the screen.
4. Select the `.gcache` file from your device.
5. The app will instantly wipe the current map, load your friend's custom map, apply their Narrative Goal, and ready the timer for you to play!

### **What is the Random Generator?**
If you don't feel like manually placing locations, the Random Generator (Dice icon) does it for you. It asks you:
- How many drops you want (e.g., 10).
- How wide of a radius you want to search (e.g., 2 miles around you).
- A Name & Description for the new points.
It mathematically scatters the caches in a circle around your current location!

---

## 🏃 Adversary Mode (The Hunter)

### **What is Adversary Mode?**
If you want an extreme challenge, you can enable "The Hunter" before starting your map. This creates a hostile red radius that actively chases you while you play. 
- **Stalker:** Walking pace (~3mph)
- **Hunter:** Jogging pace (~6mph)
- **Slayer:** Sprinting pace (~12mph)

### **How do I know if the Adversary is close?**
The game's Heads Up Display explicitly tracks your distance to The Hunter. If the Adversary gets within 500 feet of your location, your screen will begin flashing red and emitting an audible alarm pulse to warn you to run faster! If they catch you, it's an instant Game Over.

---

## ✨ Advanced Features & Polish

### **Universal Auto Check-in (Safety Feature)**
Even if you have a specific cache set as your "Active Target", Cache Dash acts as a safety net. If you happen to physically walk within the trigger radius of *any* other cache on your map, the game will automatically detect it, pop an auto-confirm countdown, and secure it for you so you don't have to stare at your screen!

### **Map Auto-Centering**
Tap the **Crosshairs** button (My Location) toggle to enable continuous auto-centering. While this is active, the crosshairs icon will glow blue, and the map camera will smoothly follow you as you walk or run. Tap it again to unlock the camera so you can pan around manually.

### **Will my screen go to sleep while playing?**
No! Cache Dash utilizes the Screen Wake Lock API. As long as you have hit the **Play** button, your phone's screen will stay active and awake during your race!

---

## ⚙️ Technical Features

### **Does this track me over the internet?**
**No.** Cache Dash is a strictly local Web App. It does not send your GPS coordinates to any central server. All of your location tracking, cache data, and scores are processed directly inside your phone's local web browser cache (`IndexedDB`). It is intensely private.

### **Does it work Offline?**
**Yes!** If you are actively out in the woods with zero cell-service, the game runs perfectly. 
*Note: The map tiles themselves require an internet connection to be actively downloaded, but the game logic, GPS calculations, and check-ins function completely offline.*

### **What if my GPS is jumping around or taking a long time?**
When you launch the app or tap the **Locate Me** (Crosshairs) button, the app actively pings your hardware GPS chip. If you are indoors or in a dense city, this might take a moment. A full-screen "LOCATING..." spinner will appear. Do not panic! It is just waiting for your phone to give it an accurate reading, and it will disappear the moment your location is found.

### **I want to start over. How do I delete everything?**
Tap the red **Delete All** button at the top of the screen. This will permanently wipe your local database, reset your score, and put the map back to a blank slate. *This cannot be undone, so be sure you don't care about the current map!*
