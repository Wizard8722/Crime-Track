# Crime Track — Offline Android APK

This folder turns Crime Track into a **fully offline Android APK**.

* **No server, no PostgreSQL, no internet** — the Express API is not used in the APK.
* **All data is stored locally on the Android device** inside the app's private
  storage (an IndexedDB database named `crime_track` created by
  `frontend/src/db.js`). The NRC dropdown data is bundled from
  `dataset/full_nrc_dataset.csv` into the APK.
* The regular web app (`frontend` + `backend`) is unchanged and still works
  online; offline mode is only activated by the `VITE_OFFLINE=true` build flag
  (`frontend/.env.offline`).

## Requirements

| Tool | Notes |
| --- | --- |
| Node.js 20+ | already used by the project |
| Android Studio | provides the Android SDK **and** the bundled JDK (JBR 21) |
| Internet (first build only) | Gradle + Maven libraries are downloaded once |

The build script finds the SDK/JDK automatically:

* JDK: `C:\Program Files\Android\Android Studio\jbr` (or your `JAVA_HOME`)
* SDK: `%LOCALAPPDATA%\Android\Sdk` (or your `ANDROID_HOME`)

## Build the APK

```powershell
cd "apk"
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
```

Result: **`apk\Crime-Detector-debug.apk`** (debug-signed, ready to install).

The script performs all steps:

1. `dataset/full_nrc_dataset.csv` → `frontend/src/nrc-reference.json`
2. `npm install` + `vite build --mode offline` (web bundle with local DB + bundled fonts)
3. copies the bundle to `apk\www` and strips the Google Fonts `@import`
4. `npx cap sync android` (only creates `apk\android` the first time)
5. `gradlew assembleDebug`

## Install on a phone

```powershell
adb install "apk\Crime-Detector-debug.apk"
```

…or copy the APK to the device and open it (allow "install from unknown sources").

## Device accounts

Users can create a username and password from **Administration → New user**.
Each account's records are stored in the app's private IndexedDB storage on
that phone, and account views can only list or delete their own records. Public
NRC search does not require sign-in and searches records saved by every account
on that phone. Anyone with access to the app on the device can therefore view
matching personal and crime-record details. The administrator login remains
available from the same sign-in screen.

## Default admin login

* Username: `admin`
* Password: `admin123`

Change them in **`frontend/.env.offline`** (`VITE_ADMIN_USERNAME`,
`VITE_ADMIN_PASSWORD`) *before* building. The credentials are seeded (hashed)
into the on-device database on first launch — to re-seed after changing them,
clear the app's storage (Settings → Apps → Crime Track → Storage → Clear data).

## Where is the data stored?

Everything lives in the app's private sandbox on the device
(`/data/data/com.crimetrack.app/`):

| Data | Storage |
| --- | --- |
| Crime records (create/search/delete) | IndexedDB database `crime_track` → `crime_records` |
| Admin credentials (salted SHA-256) | IndexedDB → `meta` |
| Session token / login state | `localStorage` |
| NRC township reference (428 rows) | bundled JSON inside the APK |

Uninstalling the app (or clearing its storage) deletes all of the data.
The app makes **no network requests** at runtime.

## Changing the app identity

`apk/capacitor.config.json`:

```json
{ "appId": "com.crimetrack.app", "appName": "Crime Detector" }
```

Change `appId` before the first build (changing it later creates a "different"
app with its own empty database).

## Release build (signed)

1. Create a keystore once:

   ```powershell
   keytool -genkey -v -keystore crimetrack.keystore -alias crimetrack -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add to `apk/android/app/build.gradle` inside `android { ... }`:

   ```gradle
   signingConfigs {
     release {
       storeFile file("../../crimetrack.keystore")
       storePassword "YOUR_STORE_PASSWORD"
       keyAlias "crimetrack"
       keyPassword "YOUR_KEY_PASSWORD"
     }
   }
   buildTypes {
     release {
       signingConfig signingConfigs.release
       minifyEnabled false
     }
   }
   ```

3. Build:

   ```powershell
   .\apk\android\gradlew.bat -p .\apk\android assembleRelease
   ```

   Output: `apk\android\app\build\outputs\apk\release\app-release.apk`

> The debug APK is already signed with the Android debug key and installs
> directly on any device — use it for testing/internal use.

## Troubleshooting

* **`SDK location not found`** — open Android Studio once, or create
  `apk\android\local.properties` containing
  `sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk`.
* **`Failed to find target with hash string android-XX`** — install the
  platform via Android Studio → SDK Manager (or
  `sdkmanager "platforms;android-XX"`), or lower `compileSdk`/`targetSdk` in
  `apk/android/variables.gradle` to a platform you have installed.
* **Gradle download is slow** — first build fetches ~150 MB; later builds are
  much faster.
* **Old web build cached** — re-run `build-apk.ps1`; it always rebuilds
  `www` from scratch.
