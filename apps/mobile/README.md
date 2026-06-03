# Jharanai Mobile (Sales Executive)

Flutter app for milkmen — QR-scan delivery confirmation with offline-first sync.

## Scope (MVP)

- Phone + OTP login
- Today's Route screen (sequenced customer list)
- QR scanner
- Confirm delivery (qty editor)
- Offline queue → sync on reconnect
- Cash collection toggle
- End-of-day summary

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Flutter 3.22+ |
| State | Riverpod |
| Networking | Dio |
| Local DB | Drift (SQLite ORM) |
| QR | `mobile_scanner` |
| Secure store | `flutter_secure_storage` |

## Theme

`lib/theme/tokens.dart` mirrors `packages/shared/src/tokens.ts`. **When you
update one, update the other in the same commit.**

## Distribution

Internal release via Firebase App Distribution.

```bash
flutter build apk --release
firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk \
  --app <FIREBASE_APP_ID> \
  --groups milkmen
```

## Run locally

```bash
flutter pub get
flutter run
```
