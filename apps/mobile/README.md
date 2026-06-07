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
flutter pub get

# REQUIRED — generates Drift code (storage/database.g.dart)
dart run build_runner build --delete-conflicting-outputs

# Then either:
flutter run                                                # uses default API_BASE
flutter run --dart-define=API_BASE=http://192.168.1.20:3000  # custom backend
```

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
