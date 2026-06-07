# Local demo guide

Three ways to see the system running on your laptop, in increasing order
of effort.

## What you already have on this machine

- Node 24 ✅
- npm 10 ✅
- Docker ✅ (we'll use this for Postgres)
- Flutter — **not installed** (needed only for Path C)
- Postgres locally — **not installed** (Docker covers it)

---

## Path A — Web admin alone (mock data, ~60 seconds)

The admin app falls back to seeded mock data when the backend isn't
reachable, so you can see every screen working without any backend or
DB at all. Pages will show a "demo data" pill on cards that would
otherwise show live numbers.

```bash
# From the repo root
npm install            # only the first time, ~2 min
npm run dev -w @jharanai/web-admin
```

Then open **http://localhost:3001** in your browser.

**Limits:** no login flow (the page bypasses auth in mock mode), no real
CRUD, the CSV import will fail because there's no backend to validate
against. But you see Dashboard / Routes / Customers / Executives /
Broadcasts / Billing / Settings / Products / Audit — all with realistic
seed-style content.

---

## Path B — Full backend + admin with real DB (Postgres in Docker, ~5 minutes) ⭐ recommended

This gives you a real end-to-end demo: login, create customer, record
payment, view dashboard with real numbers. Payment gateway and
WhatsApp stay on stub providers (no creds needed).

### 1. Start Postgres in Docker

```bash
docker run -d \
  --name jharanai-postgres \
  -e POSTGRES_PASSWORD=jharanai \
  -e POSTGRES_DB=jharanai \
  -p 5432:5432 \
  postgres:16
```

Verify it's up:
```bash
docker ps | grep jharanai-postgres
```

### 2. Set the backend env

Create `apps/backend/.env`:

```bash
cat > apps/backend/.env <<'EOF'
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://postgres:jharanai@localhost:5432/jharanai
DIRECT_URL=postgresql://postgres:jharanai@localhost:5432/jharanai

JWT_SECRET=local-dev-secret-at-least-16-chars-long
JWT_EXPIRES_IN=7d

# Stub providers — no real gateway creds needed for the demo
PAYMENT_PROVIDER=stub
MESSAGING_PROVIDER=stub
SMS_PROVIDER=console
STORAGE_PROVIDER=local

ADMIN_ORIGIN=http://localhost:3001
BUSINESS_TZ=Asia/Kolkata
EOF
```

### 3. Run migrations + seed

```bash
cd apps/backend
npm run db:generate              # generate Prisma client
npm run db:migrate               # applies 0000_init + 0001 + 0002
npm run db:seed                  # creates Anil Das admin + 6 routes + customers
cd ../..
```

Seed output will print:
```
[seed] admin login: anil@jharanai.local / demo1234
```

### 4. Open two terminals — run backend + admin in parallel

**Terminal 1** (backend):
```bash
npm run dev -w @jharanai/backend
# Listens on http://localhost:3000
```

**Terminal 2** (admin):
```bash
npm run dev -w @jharanai/web-admin
# Listens on http://localhost:3001
```

### 5. Log in

Open **http://localhost:3001**, click **Login**, use:

| Field | Value |
|---|---|
| Email | `anil@jharanai.local` |
| Password | `demo1234` |

You should land on the dashboard with **live** data (no "demo data" pill).
Now you can:

- Create a customer (Add Customer button on /customers)
- Upload a CSV (download the template, fill, upload, validate, commit)
- Record a payment on a customer's detail page → balance updates
- Open `/settings` and edit a setting → reload `/billing` → new rate applies
- Open `/settings/audit` → see QR-revoke + delivery-confirm events

### To stop / clean up

```bash
# Stop the dev servers with Ctrl+C in each terminal
# Stop and remove the Postgres container:
docker stop jharanai-postgres && docker rm jharanai-postgres
```

---

## Path C — Add the mobile app (Flutter, ~30 minutes setup first time)

Requires Flutter SDK + an Android emulator OR a physical Android phone
with USB debugging.

### 1. Install Flutter

Follow https://docs.flutter.dev/get-started/install/windows — pick the
**Android only** path. After install, run `flutter doctor` and accept
all the Android license prompts.

### 2. Bootstrap platform folders (once)

```bash
cd apps/mobile
flutter create --platforms=android,ios --org com.jharanai --project-name jharanai_mobile .
```

This generates `android/`, `ios/`, `web/` — not in git because Flutter
regenerates them. Now patch the manifest:

**`apps/mobile/android/app/src/main/AndroidManifest.xml`** — add inside
the `<manifest>` block, before `<application>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

**`apps/mobile/android/app/build.gradle`** — set `minSdkVersion 23`.

### 3. Install deps + generate Drift code

```bash
cd apps/mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

### 4. Point the app at your local backend

The backend must be running (Path B). For an **Android emulator**, the
host's `localhost` is `10.0.2.2`. For a **physical phone on the same
Wi-Fi**, find your laptop's LAN IP (`ipconfig`) and use that.

```bash
# Emulator
flutter run --dart-define=API_BASE=http://10.0.2.2:3000

# Physical phone over Wi-Fi
flutter run --dart-define=API_BASE=http://192.168.1.20:3000   # replace IP
```

### 5. Log in as an executive

The seed creates 5 executives. Use any of these phones (OTP path):

| Name | Phone |
|---|---|
| Manas Behera | `+919000000001` |
| Pradeep Sahu | `+919000000002` |
| Lipun Nayak | `+919000000003` |
| Ramesh Sahu | `+919000000004` |
| Bibhuti Pradhan | `+919000000005` |

The OTP code is **printed in the backend terminal** (we're on the
`console` SMS provider — no real SMS is sent). Look for a line like:

```
[auth] OTP for +919000000001: 482917
```

Paste that into the mobile app. You'll land on today's route.

### Mobile features to try
- Today's route (sorted by route sequence)
- Tap a customer → scan their QR (or use the "Simulate scan" button in
  debug mode)
- Confirm delivery with cash collected → balance debits on the backend
- End of day → submit report
- Turn airplane mode on → confirm a scan → it queues locally → turn
  Wi-Fi back on → watch it sync

---

## Recommended demo order

1. **Path A first** (60 seconds): get a feel for the UI without any
   setup.
2. Then **Path B** (5 minutes with Docker): see the real flows working
   end-to-end. This is the demo to show stakeholders.
3. **Path C only when needed**: the mobile + offline + sync story is
   compelling but requires Flutter setup. Worth doing once before a
   field test.

## Common issues

| Symptom | Cause | Fix |
|---|---|---|
| Admin login says "Invalid credentials" | Seed didn't run | `cd apps/backend && npm run db:seed` |
| Backend crashes on startup with "DATABASE_URL is required in production" | `NODE_ENV=production` set in env | Change to `development` or supply real DB URL |
| Backend logs "Sentry not initialized" | No SENTRY_DSN | Cosmetic; ignore for local |
| Admin shows "demo data" pill everywhere | Backend not reachable | Check backend is on port 3000 + no CORS errors in browser console |
| `docker ps` doesn't show jharanai-postgres | Container exited | Check `docker logs jharanai-postgres` — port 5432 likely already in use |
| Mobile won't connect to backend | Wrong API_BASE | Emulator needs `10.0.2.2`, physical phone needs LAN IP |
| Mobile scanner shows black screen | Camera permission missing from manifest | Re-check the AndroidManifest patch in Path C step 2 |
