# Jharanai Backend

NestJS + Prisma API for the Jharanai CRM.
Currently scoped to the **data layer** — schema, migrations, seed. HTTP modules
(auth, customers, routes, deliveries, whatsapp, broadcasts) will be added next
once the NestJS toolchain is reinstalled.

---

## Data layer status

| Item | State |
| --- | --- |
| Prisma schema (`prisma/schema.prisma`) | ✅ complete — 12 models, 10 enums |
| Initial migration (`prisma/migrations/0000_init/migration.sql`) | ✅ generated offline |
| `migration_lock.toml` | ✅ committed |
| Seed script (`prisma/seed.ts`) | ✅ matches admin mock data (Berhampur cluster) |
| Prisma client singleton (`src/prisma.ts`) | ✅ |
| Supabase pooler config (`directUrl`) | ✅ in schema + `.env.example` |

---

## One-time Supabase setup

1. **Create project** at <https://supabase.com/dashboard> → choose **Mumbai (ap-south-1)** region.
2. **Wait ~2 min** for provisioning.
3. Open **Project Settings → Database**.
4. Scroll to **Connection string**. You need TWO strings:

| Variable | Tab | Port | Use |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Transaction pooler** | **6543** | Runtime queries (via PgBouncer) |
| `DIRECT_URL` | **Session** / direct | **5432** | Prisma Migrate (must bypass PgBouncer) |

5. Copy both into `apps/backend/.env` (copy from `.env.example` first):

   ```env
   DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
   DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
   ```

6. **URL-encode** the password if it contains special characters (`@`, `:`, `/`, `#`, etc.) — common Supabase gotcha.

---

## Apply migrations + seed

After `.env` is in place:

```bash
cd apps/backend

# Generate Prisma Client from the schema (once per schema change)
npm run db:generate

# Apply all migrations to Supabase (production-safe)
npm run db:migrate

# Populate dev data (routes, executives, customers)
npm run db:seed

# Optional — open Prisma Studio to browse the data
npm run db:studio
```

---

## Day-to-day: changing the schema

We follow the SOP **migration ceremony** — *write → dry-run on staging → apply → re-verify live.*

1. Edit `prisma/schema.prisma`.
2. Generate the migration:
   ```bash
   npm run db:migrate:dev -- --name describe_change_here
   ```
   This creates a new folder under `prisma/migrations/` and applies it locally.
3. Commit the new migration folder + updated `schema.prisma`.
4. **Staging dry-run**: `npm run db:migrate` against staging Supabase.
5. Re-verify with `npm run db:studio` or a quick SQL check.
6. Production: same `npm run db:migrate` against prod URL (via CI, not local).

**Never** edit a migration that has already been applied to any shared environment — write a new migration instead.

---

## Backup before destructive migrations

Supabase keeps daily backups on paid plans. Before any migration that drops
columns / tables, take a manual point-in-time snapshot:

```
Supabase dashboard → Database → Backups → Take snapshot
```

---

## Why the connection looks weird

Supabase exposes Postgres via two routes:

- **PgBouncer pooler (port 6543)** — needed because Postgres has a hard
  connection cap (~60 on free, ~200 on Pro). All app traffic goes here.
- **Direct connection (port 5432)** — needed for migrations because PgBouncer
  in transaction mode can't run things like `CREATE TYPE` reliably.

Prisma reads `url` for queries, `directUrl` for the migration engine. Both
must be present.

---

## Next backend tasks (deferred)

- Reinstall full NestJS toolchain (with override pinning `terser-webpack-plugin` to a real version)
- `auth` module — JWT for admin, phone+OTP for executives
- `customers`, `routes`, `subscriptions`, `deliveries` REST endpoints
- `whatsapp` module — Meta Cloud API webhook + send pipeline
- `broadcasts` composer endpoint
- BullMQ workers (auto-resume, daily route prep, renewal reminders)
