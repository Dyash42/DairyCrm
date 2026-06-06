# Contributing

The full bar is in `docs/rules.md`. This is the short version.

## The loop

```
Plan → Build → Review → Verify → Ship → Audit → Fix → repeat
```

No end-stage QA. Audit and fix continuously, in small passes.

## Before every push

```bash
npm run typecheck -ws                  # types green
npm run test -ws                       # tests green
npm run build -w @jharanai/web-admin   # prod build green
```

If you changed `prisma/schema.prisma`:

```bash
cd apps/backend
npx prisma format && npx prisma validate
npm run db:migrate:dev -- --name describe_change
```

If you changed `apps/mobile`:

```bash
cd apps/mobile
flutter analyze
flutter test
```

## Branches

- `main` is protected — no direct pushes.
- Feature: `feat/short-slug`
- Fix: `fix/short-slug`
- Chore: `chore/short-slug`

## Commits

Conventional-style first line, body explains *why*:

```
type: short imperative summary (≤72 chars)

Why this change exists. Trade-offs. Anything non-obvious.

Closes #123
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
`perf`, `style`, `ci`.

**Never `--no-verify`.** If a hook fails, fix the root cause.

## Pull requests

Use the template. Required checklist:

- [ ] Types green (`npm run typecheck -ws`)
- [ ] Tests green (`npm run test -ws`)
- [ ] Prod build green (`npm run build -w @jharanai/web-admin`)
- [ ] If safety-critical: tests added or modified
- [ ] If schema change: migration ceremony followed
- [ ] If new env var: added to `.env.example`
- [ ] If new design token: mirrored to mobile

## Safety-critical changes

If you touch any of these, the PR **must** include a test:

- `apps/backend/src/whatsapp/sender.ts`
- `apps/backend/src/whatsapp/webhook.ts`
- `apps/backend/src/whatsapp/flows/*.ts` (any payment / quote logic)
- `apps/backend/src/whatsapp/payment.ts`
- Anything under `apps/backend/src/auth/` (when added)
- `apps/backend/prisma/schema.prisma`

See `SECURITY.md` for the full list and why.

## AI-assisted commits

If an AI agent helped write the code, add the trailer:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

## Questions?

Open a discussion or ask in chat. If a rule in `docs/rules.md` is wrong,
update it in a PR before working around it.
