# Jharanai Mobile (Sales Executive)

Flutter app for milkmen — QR-scan delivery confirmation with offline-first sync.

## Status (live as of this commit)

| Layer | What's done |
| --- | --- |
| API client | Dio + JWT interceptor, structured error mapping, configurable base URL via `--dart-define=API_BASE` |
| Auth | Real OTP login flow (POST `/auth/executive/otp/request` + `/verify`), JWT persisted in `flutter_secure_storage`, restored on cold start, signOut wired |
| Today's route | Fetched from `/deliveries/today` on launch + after login; falls back to demo data via the dev drawer |
| QR scanner | Real camera via `mobile_scanner` package (with torch + close), `kDebugMode`-only "Simulate scan" affordance |
| Offline sync | Drift SQLite queue (`QueuedScans` table); push-when-online engine triggered by `connectivity_plus` events; failure → bump attempt + retry on next online tick |
| Cash collection | Optional cash field in the confirm sheet |
| End of day | Summary screen with totals + Submit button (clears local queue) |

## First run

```bash
cd apps/mobile

# 1. Bootstrap the platform folders (android/, ios/). The repo only
#    tracks the Dart source under lib/ + pubspec.yaml + tests — the
#    native scaffolding lives outside version control because it's
#    generated and 99% boilerplate. Run this ONCE per fresh clone.
flutter create --platforms=android,ios --org com.jharanai --project-name jharanai_mobile .

# 2. Patch the freshly-generated AndroidManifest to add the permissions
#    the app actually needs (see "Required Android permissions" below).
#    Without these the QR scanner silently fails to open the camera.

# 3. Install deps + generate Drift code (storage/database.g.dart).
flutter pub get
dart run build_runner build --delete-conflicting-outputs

# 4. Run.
flutter run                                                # uses default API_BASE
flutter run --dart-define=API_BASE=http://192.168.1.20:3000  # custom backend
```

### Required Android permissions

Add these inside the `<manifest>` block of
`android/app/src/main/AndroidManifest.xml` (the file created by step 1
above), ABOVE the `<application>` tag:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

And in `android/app/build.gradle`, ensure:

```gradle
defaultConfig {
    minSdkVersion 23  // flutter_secure_storage uses EncryptedSharedPreferences from API 23+
    targetSdkVersion 34
}
```

Without `minSdkVersion 23` the JWT silently falls back to plaintext
`SharedPreferences` on older devices — the secure-storage promise is broken.

### Required iOS keys

In `ios/Runner/Info.plist` add (between `<dict>` tags):

```xml
<key>NSCameraUsageDescription</key>
<string>Scan customer QR codes for delivery confirmation</string>
```

The store rejects builds that use the camera without a usage string.

### API base URL

Defaults to `http://10.0.2.2:3000` (the Android emulator's view of host
`localhost`). Override per environment:

```bash
# Local backend on a phone over Wi-Fi
flutter run --dart-define=API_BASE=http://192.168.1.20:3000

# Staging
flutter run --dart-define=API_BASE=https://staging-api.jharanai.com

# Production
flutter build apk --release --dart-define=API_BASE=https://api.jharanai.com
```

## Architecture

```
lib/
├── main.dart                 ← AuthGate routes to Login or TodaysRoute
├── api/
│   ├── config.dart           ← base URL + timeouts (--dart-define)
│   ├── client.dart           ← Dio + JWT interceptor + TokenStore
│   ├── error.dart            ← ApiException with typed kinds
│   ├── auth_api.dart         ← requestOtp / verifyOtp / me
│   └── delivery_api.dart     ← todaysRoute / confirm / skip / lookupByCode
├── auth/
│   └── auth_provider.dart    ← AuthController + persisted JWT
├── storage/
│   └── database.dart         ← Drift QueuedScans table + queries
├── sync/
│   ├── connectivity.dart     ← connectivity_plus → bool stream
│   └── sync_engine.dart      ← drain offline queue when online
├── state/
│   └── route_provider.dart   ← Today's route (live + demo modes)
├── models/
│   └── delivery_stop.dart    ← shared domain shapes
├── screens/
│   ├── login_screen.dart     ← phone → OTP → /verify
│   ├── todays_route_screen.dart
│   ├── qr_scanner_screen.dart
│   └── end_of_day_screen.dart
├── widgets/
│   └── confirm_delivery_sheet.dart  ← litres + cash + skip
└── theme/                    ← design tokens (mirror of packages/shared)
```

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Flutter 3.22+ |
| State | Riverpod 2 |
| HTTP | Dio 5 |
| Local DB | Drift (SQLite) |
| QR | `mobile_scanner` |
| Connectivity | `connectivity_plus` |
| Secure storage | `flutter_secure_storage` (Android Keystore / iOS Keychain) |

## Honest caveat

This codebase has been written carefully but **not yet compiled** in the
session it was authored in (`flutter analyze` has not been run here).
First run on your machine may surface a couple of import/lint cleanups.
Easy to fix; nothing structural.

## Distribution

Internal release via Firebase App Distribution:

```bash
flutter build apk --release --dart-define=API_BASE=https://api.jharanai.com
firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk \
  --app <FIREBASE_APP_ID> \
  --groups milkmen
```

## Theme

`lib/theme/tokens.dart` mirrors `packages/shared/src/tokens.ts`. **When
you update one, update the other in the same commit.**

## Dev menu

Open the drawer (hamburger top-left) on the route screen:
- **Live data** — default; fetches from backend
- **Demo modes** — render the 4 PDF design states for design review
- **Sign out** — clears JWT, returns to login
