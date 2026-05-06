# Nirmal Connect

Bilingual (Tamil-default) political leader website + grievance management platform for Hon. C.T.R. Nirmal Kumar (MLA, Tirupparankundram), with TVK red/gold branding.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/nirmal-connect run dev` — web frontend
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)
- `npx tsx lib/db/src/seed.ts` — seed sample content (admin: admin@nirmalconnect.in / Admin@2024)
- `pnpm --filter @workspace/api-spec run codegen` — regen API hooks + Zod from OpenAPI
- `pnpm run typecheck` / `pnpm run build`
- Required env: `DATABASE_URL`, `JWT_SECRET` (auto-generated if absent in dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite 7, wouter routing, TanStack Query, Tailwind
- API: Express 5, custom HMAC JWT (`artifacts/api-server/src/lib/auth.ts`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`)

## Where things live

- DB schema: `lib/db/src/schema.ts` (source of truth)
- Seed data: `lib/db/src/seed.ts`
- API contract: `lib/api-spec/openapi.yaml` (source of truth)
- API routes: `artifacts/api-server/src/routes/*`
- Frontend pages: `artifacts/nirmal-connect/src/pages/*`
- i18n strings: `artifacts/nirmal-connect/src/lib/i18n.ts`
- TVK theme: `artifacts/nirmal-connect/src/index.css`

## Architecture decisions

- Bilingual content stored as twin columns (`title`/`titleTa`, `content`/`contentTa`) — pages select one based on `lang` state.
- Default language is Tamil (`ta`); English is opt-in via the navbar toggle.
- Wow endpoints use 3-segment paths (`/news/featured/latest`, `/events/upcoming/list`, `/activities/recent`) so they don't collide with `/news/:id` or `/events/:id`.
- JWT is hand-rolled HMAC (no external dep) — admin-only routes guarded by `requireAuth` middleware.

## Product

Public site (home, about, news, events, gallery, activities, achievements, FAQ, contact, donate, emergency, volunteer, grievance submission) + admin CMS for content + grievance lifecycle management.

## User preferences

- Content defaults to Tamil. Keep Tamil translations populated for all new content.

## Gotchas

- After OpenAPI changes, always run `pnpm --filter @workspace/api-spec run codegen` before touching frontend hooks.
- `lib/api-zod/src/index.ts` must export ONLY from `./generated/api`.
- Seed with `npx tsx lib/db/src/seed.ts` (pnpm exec tsx fails — tsx isn't a workspace dep).

## Pointers

- `pnpm-workspace`, `react-vite`, `database`, `replit-auth` skills
