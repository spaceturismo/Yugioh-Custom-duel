# Custom Duel App Setup

## Web app

The installable web app is published at:

https://spaceturismo.github.io/Yugioh-Custom-duel/

Open it in a supported browser and use the browser's install command to add it to the device. The service worker caches the stable app shell for repeat and offline launches.

## Android

Install Node.js, Android Studio, and the Android SDK. From this directory run:

```powershell
npm install
npx cap add android
npx cap sync android
npx cap open android
```

Build or run the app from Android Studio. The Android project is intentionally generated locally because it contains platform build output and requires the Android SDK.

## iOS

iOS builds require macOS and Xcode. From this directory on macOS run:

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Future backend work

The current game is local-first and uses browser storage. Accounts, cloud decks, and multiplayer require a backend and authentication design; they are not part of this static app package yet.