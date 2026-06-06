# Jharanai — engineering rules

The single bar every contributor (human or AI) must meet.
These rules are deliberately **machine-readable** so AI agents and humans
follow the same standard. They are derived from the
**Built Smoothly SOP** (`docs/Built-Smoothly-Development-SOP.docx`).

If a rule here contradicts a teammate, **the rule wins** — update the rule
in a PR first.

---

## 0. The loop

Every change, every day:

```
Plan → Build → Review → Verify → Ship → Audit → Fix → repeat
```

- **Plan**: turn intent into a crisp spec; align before code.
- **Build**: smallest change that works; tests first.
- **Review**: automated code review + security review on every diff.
- **Verify**: type-check, tests, prod build — **all green** before push.
- **Ship**: small commit, clear message, push.
- **Audit → Fix**: continuous focused sweeps; fix as you find.

There is **no end-stage QA**. Quality is a habit, not a phase.

---

## 1. Repo structure

```
apps/web-admin    Next.js 14 admin (Ops team)
apps/mobile       Flutter app (milkmen) — offline-first
apps/backend      NestJS + Prisma API + WhatsApp bot engine
packages/shared   TypeScript types + design tokens — single source of truth
docs/             Specs, SOPs, rules
```

- `packages/shared` is the source of truth for types and design tokens.
  Mobile mirrors tokens in `apps/mobile/lib/theme/tokens.dart` —
  **change both files in the same commit.**
- Cross-app code lives in `packages/shared`. No `apps/*` imports from
  another `apps/*`.

---

## 2. Safety-critical surfaces (100% test coverage target)

Per SOP: *"100% on anything safety-critical — auth, finalize-locks, payments, uploads."*

For Jharanai, **safety-critical** means anything that, if broken, causes:
- Money loss or charge error
- Wrong customer billed / delivered
- Customer spam (WhatsApp messages sent that shouldn't have been)
- PII leak
- Loss of delivery record

Concretely:

| Surface | Why critical |
|---|---|
| `apps/backend/src/whatsapp/sender.ts` | Sending a wrong message costs ₹ and customer trust |
| `apps/backend/src/whatsapp/webhook.ts` | Webhook signature verification — security boundary |
| `apps/backend/src/whatsapp/flows/onboarding.ts` (payment step) | Wrong amount → bad charge |
| `apps/backend/src/whatsapp/flows/renew.ts` (quote calc) | Wrong amount → bad charge |
| `apps/backend/src/whatsapp/payment.ts` | Razorpay link generation |
| Any `Delivery` mutation in backend | Logs determine billing |
| Any `Subscription` mutation in backend | Defines what gets delivered |
| Auth (admin login, executive OTP, JWT verify) | Identity boundary |
| Prisma migrations | Schema changes touch live data |

The rest of the codebase: **80% coverage floor** is fine.

---

## 3. Coding rules (TypeScript)

- **Strict mode on** — `tsconfig.base.json` enables `strict`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`.
- **No `any`.** Use `unknown` and narrow. If you must, leave a `// TODO`.
- **Immutability by default** — `const`, `readonly`, `as const`.
  Mutate only inside the smallest possible scope.
- **Many small files > one big file.** A `*.ts` file > 300 lines is a
  refactor candidate.
- **No default exports** in `packages/shared` (named imports only).
- **Named function parameters** for any function with 3+ args. Use an
  options object.
- **Tabular numerals on all numbers a user sees** — currency, litres,
  counts. Web uses `tabular` class; mobile uses `FontFeature.tabularFigures`.
- **Currency formatting**: `formatINR` from `@jharanai/shared`. Never
  manually concatenate `'₹' + amount`.
- **Dates**: ISO 8601 (`YYYY-MM-DD`) at API boundary, localized in the UI.
  IST is the only timezone we operate in.

### Naming

- TS files: `kebab-case.ts` (e.g. `session-store.ts`).
- React components: `PascalCase.tsx`, default folder is `components/`.
- Hooks: `useThing.ts`.
- Tests: colocated `*.test.ts` next to source, or in `__tests__/`.

---

## 4. Coding rules (Flutter / Dart)

- `prefer_single_quotes`, `require_trailing_commas` enforced.
- Theme via `JharanaiTokens` — never hardcode hex colors.
- Use `Riverpod` providers for state; no `setState` for cross-screen state.
- `withOpacity` for now (broad Flutter compat). Migrate to `withValues`
  when minimum Flutter SDK ≥ 3.27.
- Offline-first: any new write to the local SQLite **must** have a sync
  pipeline within the same PR.

---

## 5. Security rules

Per SOP: *"Security before every commit. No secrets in code, validate all input, least privilege by default."*

1. **Never commit secrets.** `.env*` is gitignored. Only `.env.example`
   is checked in.
2. **Validate every input at the boundary.** Use `zod` for HTTP body
   parsing.
3. **Authn**:
   - Admin web: JWT (HttpOnly, Secure, SameSite=Lax) on a custom subdomain.
   - Mobile: JWT in `flutter_secure_storage` (Android Keystore / iOS Keychain).
4. **Authz**: route guards on every endpoint. Default to deny.
5. **Rate limiting** on WhatsApp webhook and public endpoints (Redis
   token bucket).
6. **WhatsApp webhook**: verify Meta's `X-Hub-Signature-256` header on
   every POST. Reject mismatches.
7. **PII**: phone, address, email never logged at INFO. DEBUG-only logs
   redact phone to `+91XXXXXXXX42`.
8. **Payment**: always verify Razorpay webhook signature; never trust the
   client. Webhook is the source of truth for "paid".
9. **DB access**: only via Prisma. No raw SQL except in migrations.
10. **Migrations**: write → staging dry-run → apply → re-verify live.
    Never edit an applied migration.

---

## 6. Test rules

- **Vitest** for TS workspaces (web-admin, backend, shared).
- **flutter test** for mobile.
- A PR that changes a safety-critical file **must** add or modify a
  test in the same diff.
- Use **AAA** structure (Arrange, Act, Assert) and one assertion focus
  per `it(...)`.
- Snapshot tests are OK for stable UI; never for things that change
  often.
- Avoid mocks where a fake is just as easy. Prefer testing pure
  functions.

---

## 7. Git rules

- **Branches**: `main` is protected (no direct pushes once branch
  protection is set up on GitHub).
- **Feature branches**: `feat/short-slug`, `fix/short-slug`,
  `chore/short-slug`.
- **Commits**: Conventional-style first line, body explains "why".
  Keep them small. Don't squash discoverability — small commits make
  audits cheap.
- **PRs** must use `.github/PULL_REQUEST_TEMPLATE.md`.
- **No `--no-verify`** on commits, ever. Fix the underlying issue.

### Commit message format

```
type: short summary in imperative present tense (≤72 chars)

Optional body explaining WHY this change exists.
Reference issue / PR in `Closes #123` if relevant.

Co-Authored-By: ... (only if pair-programmed with AI)
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
`perf`, `style`, `ci`.

---

## 8. Pre-push checklist (the SOP's "green before push")

Run these in order. If anything fails, fix before pushing.

```bash
npm run typecheck -ws    # types green
npm run test -ws         # tests green
npm run build -w @jharanai/web-admin   # prod build green
```

For backend changes that touch the DB:
```bash
npx prisma format        # schema is formatted
npx prisma validate      # schema is valid
# If you added a migration:
npm run db:migrate:dev   # applies locally and tests it works
```

For mobile changes:
```bash
cd apps/mobile
flutter analyze          # static analysis green
flutter test             # unit tests green
```

---

## 9. Migration ceremony (data changes)

Per SOP: *"Migration discipline — write the change, verify it on staging, apply it, then re-verify the live state with an explicit query."*

1. **Write**: edit `apps/backend/prisma/schema.prisma`.
2. **Generate**: `npm run db:migrate:dev -- --name describe_change`.
3. **Review**: read the generated SQL in `prisma/migrations/*/migration.sql`.
4. **Staging dry-run**: `npm run db:migrate` against staging Supabase URL.
5. **Manual verify**: run an explicit `SELECT` confirming the change.
6. **Production**: same `db:migrate` via CI against prod URL.
7. **Re-verify live**: confirm with another query.

**Backup before destructive changes** (drops, type narrowing):
Supabase dashboard → Database → Backups → Take snapshot.

---

## 10. Audit habit

Per SOP: *"Audit in small passes — a focused sweep each day beats one giant QA at the end."*

When you finish a feature, do one **small focused sweep** of an
adjacent area:
- Stale TODOs
- Dead exports
- Inconsistent naming
- Missing tests on safety-critical paths
- Schema drift (Prisma vs. seed)
- Token drift (`packages/shared/src/tokens.ts` vs.
  `apps/mobile/lib/theme/tokens.dart`)

Fix what you find in the same PR if small, or open a tracked task if
larger.

---

## 11. AI agents — how we use them

- Agents are teammates. Brief them like a smart colleague who just
  walked in: explain *why*, not just *what*.
- Prefer **parallel specialists** for broad sweeps (audit, review, find
  bugs). Don't fan out for trivial tasks.
- Verify agent output before trusting it: read the diff, run the tests,
  rerun the build.
- Agent-authored commits include a `Co-Authored-By:` trailer.

---

## 12. Documentation

- Code is the truth. Docs explain *why* and the *non-obvious how*.
- Every `apps/*` and `packages/*` has a `README.md`.
- Architecture decisions go in `docs/decisions/NNNN-title.md` (ADR
  format) — only for non-obvious decisions worth re-litigating later.

---

## 13. Tokens drift — single source of truth

When you change a design token:

1. Edit `packages/shared/src/tokens.ts`.
2. Edit `apps/mobile/lib/theme/tokens.dart` to match.
3. Verify both: web admin still passes prod build; mobile still
   `flutter analyze` clean.

If you can't sync both in the same PR, the token isn't a token yet —
hardcode it locally and open a tracked task.

---

## 14. Things we explicitly DO NOT do (yet)

- **No GraphQL** — REST is fine for our scale.
- **No microservices** — one backend, multiple modules. Re-evaluate at
  100k subscribers.
- **No SSR for admin** — static prerender is enough; data is fetched
  client-side.
- **No third-party UI kit on mobile beyond Material 3** — we own the
  design system.
- **No `--force` push to `main`**. Ever.
- **No editing applied migrations** — write a new one.

---

## 15. When this document is wrong

Update it in a PR. Other rules in this file say so:
"If a rule here contradicts a teammate, the rule wins — update the rule
in a PR first."

This rule is intentionally recursive.
