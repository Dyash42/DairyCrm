# Jharanai CRM

WhatsApp-first dairy CRM & Sales Management platform for Jharanai
(Rushikulya Agro Pvt. Ltd.).

## What's in here

```
apps/
  web-admin/    Next.js 14 admin console (Ops team)
  mobile/       Flutter app for milkmen (QR scan + offline delivery)
  backend/      NestJS + Prisma API (shared by WhatsApp bot, web, mobile)
packages/
  shared/       Cross-app TypeScript types + design tokens
docs/           Product spec, SOP, design PDFs
```

## Three surfaces, one backend

| Surface | Persona | Tech |
| --- | --- | --- |
| WhatsApp bot | Customer | Meta Cloud API + NestJS module |
| Mobile app | Sales Executive (milkman) | Flutter (offline-first) |
| Web admin | Ops admin | Next.js 14 + Tailwind |

## Quick start

```bash
npm install
npm run dev           # runs all dev servers (web-admin + backend)
npm run typecheck     # green before push
npm run lint
npm run test
```

## Dev rules

We follow the **Built Smoothly** SOP — `docs/Built-Smoothly-Development-SOP.docx`.

- Plan → Build → Review → Verify → Ship → Audit → Fix
- Tests first, 80% floor, 100% on safety-critical (payments, deliveries, WhatsApp sends)
- Green before push (types + tests + prod build)
- Small commits, clear messages
- Migration ceremony for DB changes

## Status

- [x] Monorepo skeleton
- [x] Design system (`packages/shared`)
- [x] Web admin shell, Dashboard, Routes, Customers
- [ ] Backend Prisma schema + auth
- [ ] WhatsApp bot module
- [ ] Mobile delivery flow
- [ ] Broadcast composer
