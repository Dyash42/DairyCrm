# Jharanai Mobile (React Native + Expo)

The Sales Executive ("milkman") delivery app — QR-scan deliveries, offline-first.
This is the **primary** mobile app. The previous Flutter implementation is
preserved as a fallback at [`apps/mobile-flutter-plan-b`](../mobile-flutter-plan-b).

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK 52 (React Native 0.76), TypeScript |
| Routing | Expo Router (file-based, `app/`) |
| State | Zustand (`src/state`) |
| Networking | axios (`src/api`) |
| Offline queue | expo-sqlite (`src/storage/database.ts`) |
| Secure token | expo-secure-store |
| QR scan | expo-camera |
| Connectivity | @react-native-community/netinfo |
| Fonts | @expo-google-fonts/inter |

All native modules used are bundled in **Expo Go**, so no custom dev build is
needed to run the app during development.

## Run it

```bash
# from the repo root (deps are hoisted via npm workspaces)
npm install

# point the app at your backend (see .env.example for the right host per target)
cd apps/mobile
cp .env.example .env        # edit EXPO_PUBLIC_API_BASE if needed

npx expo start              # then press a (Android), i (iOS), or scan the QR with Expo Go
```

Host cheatsheet for `EXPO_PUBLIC_API_BASE`:

- Android emulator → `http://10.0.2.2:3000`
- iOS simulator → `http://localhost:3000`
- Physical device (Expo Go) → `http://<your-LAN-ip>:3000` (same Wi-Fi as the backend)

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run test        # jest (pure-logic: models + qr)
npm run lint        # expo lint
```

## Layout

```
app/                       Expo Router routes
  _layout.tsx              fonts + store bootstrap + auth gate + toast overlay
  index.tsx                splash -> redirect by auth state
  login.tsx                two-step OTP login
  (app)/_layout.tsx        authenticated stack (headers)
  (app)/index.tsx          Today's Route (home)
  (app)/scan.tsx           camera QR scanner
  (app)/end-of-day.tsx     end-of-day report
  (app)/profile.tsx        account / sign out
  (app)/help.tsx           offline help
src/
  api/                     axios client, auth + delivery APIs, errors, token store
  components/              StopCard, RouteHeader, RouteCompleteCard, OfflineBanner,
                           ConfirmDeliverySheet, ui/(Text, StatusPill, Toast)
  models/                  DeliveryStop, RouteSummary (+ tests)
  state/                   auth / route / sync / network / scan / toast stores
  storage/                 expo-sqlite offline scan queue
  lib/                     formatting, date, qr helpers
  theme/                   design tokens
```

See [`docs/MOBILE_RN_MIGRATION.md`](../../docs/MOBILE_RN_MIGRATION.md) for the full
Flutter → React Native migration report.
