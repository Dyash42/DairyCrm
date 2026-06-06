<!--
  Built Smoothly SOP — every PR follows this checklist.
  See docs/rules.md for the full bar.
-->

## What

<!-- One-paragraph summary of the change. What changed and where. -->

## Why

<!-- Why this change exists. What problem it solves. Link an issue if any. -->

## Verification (the SOP "green before push" gate)

- [ ] `npm run typecheck -ws` — all workspaces green
- [ ] `npm run test -ws` — all tests green
- [ ] `npm run build -w @jharanai/web-admin` — prod build green
- [ ] If mobile changed: `flutter analyze` + `flutter test` green

## Safety-critical changes

If this PR touches any of the surfaces below, **at least one test must be
added or modified in the same diff**. See `SECURITY.md` for the canonical
list.

- [ ] N/A — no safety-critical files touched
- [ ] `apps/backend/src/whatsapp/sender.ts` — covered
- [ ] `apps/backend/src/whatsapp/webhook.ts` — covered
- [ ] `apps/backend/src/whatsapp/flows/*` payment / quote calc — covered
- [ ] `apps/backend/src/whatsapp/payment.ts` — covered
- [ ] Auth (admin login, executive OTP) — covered
- [ ] Delivery / Subscription mutations — covered
- [ ] `apps/backend/prisma/schema.prisma` — migration ceremony followed (see below)

## Schema changes (Prisma)

- [ ] N/A — no schema change
- [ ] Migration generated via `npm run db:migrate:dev -- --name <slug>`
- [ ] Migration SQL reviewed by hand
- [ ] Dry-run on staging Supabase succeeded
- [ ] Manual `SELECT` confirmed the live shape

## Environment / secrets

- [ ] N/A — no new env vars
- [ ] New env var(s) added to `apps/backend/.env.example`
- [ ] Documented in the matching README

## Design tokens

- [ ] N/A — no token change
- [ ] Updated `packages/shared/src/tokens.ts`
- [ ] Mirrored to `apps/mobile/lib/theme/tokens.dart` in the same commit

## Screenshots / screencast (UI changes)

<!-- Drop before/after screenshots or a Loom for any visible change. -->

## Notes for reviewers

<!-- Anything reviewers should look at carefully. Trade-offs, alternatives considered. -->
