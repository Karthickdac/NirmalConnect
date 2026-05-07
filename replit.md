# Nirmal Connect

Bilingual (Tamil-default) political leader website + grievance management platform for Hon. C.T.R. Nirmal Kumar (MLA, Tirupparankundram), with TVK red/gold branding.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/nirmal-connect run dev` — web frontend
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)
- `npx tsx lib/db/src/seed.ts` — seed sample content (admin: admin@nirmalconnect.in / Admin@2024)
- `pnpm --filter @workspace/api-spec run codegen` — regen API hooks + Zod from OpenAPI
- `cd lib/db && npx tsc -p tsconfig.json` — must run after adding new schema tables
- Required env: `DATABASE_URL`, `JWT_SECRET` (auto-generated ephemerally if absent in dev)
- CMS image storage uses Replit Object Storage. Provision once via the Object Storage tool (or `setupObjectStorage()` in the code-execution sandbox); this populates `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, and `PRIVATE_OBJECT_DIR`. New admin uploads stream to `${PRIVATE_OBJECT_DIR}/admin/<filename>`; legacy files under `artifacts/api-server/uploads/admin/` continue to serve from disk.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite 7, wouter routing, TanStack Query, Tailwind, Recharts
- API: Express 5, custom HMAC JWT (`artifacts/api-server/src/lib/auth.ts`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`)

## Where things live

- DB schema: `lib/db/src/schema/` (source of truth — index.ts re-exports all tables)
- Seed data: `lib/db/src/seed.ts`
- API contract: `lib/api-spec/openapi.yaml` (public routes only)
- Admin API routes: `artifacts/api-server/src/routes/admin.ts` (protected by `requireStaff`)
- Public site routes: `artifacts/api-server/src/routes/site.ts` (GET /about)
- Frontend pages: `artifacts/nirmal-connect/src/pages/*`
- Admin CMS pages: `artifacts/nirmal-connect/src/pages/admin/*`
- i18n strings: `artifacts/nirmal-connect/src/lib/i18n.ts`
- TVK theme: `artifacts/nirmal-connect/src/index.css`

## Architecture decisions

- Bilingual content stored as twin columns (`title`/`titleTa`, `content`/`contentTa`).
- Default language is Tamil (`ta`); English is opt-in via navbar toggle.
- 3-segment "special" paths (`/news/featured/latest`) avoid Express v5 `:id` collisions.
- Admin CRUD routes live in `admin.ts` (not OpenAPI spec) — called via direct `authFetch()` from `admin/api.ts`.
- Public CMS reads split from admin writes: GET /api/about is public; PUT /api/admin/about requires staff auth.
- `setAuthTokenGetter(() => getToken())` called at module level in `App.tsx` — wires JWT to all generated hooks.
- CMS-editable content stored in `site_config` table as JSON key-value pairs (keys: `about`, `social_links`, `contact_info`, `emergency_contacts`).
- Audit log table (`admin_audit_log`) records all admin CREATE/UPDATE/DELETE with actor + target.
- After new schema tables: run `cd lib/db && npx tsc -p tsconfig.json` to regenerate `.d.ts` for api-server typecheck.

## Product

Public site (home, about [CMS-driven], news, events, gallery, activities, achievements, FAQ, contact, donate, emergency, volunteer, grievance submission) + grievance lifecycle management + full admin CMS panel with role-based access:
- 14 nav sections: Dashboard (Recharts KPIs), Grievances, News, Press Releases, Events, Activities, Gallery, Banners, Volunteers (+CSV export), Constituency Stats, FAQs, About CMS, Site Settings, Audit Log (+CSV export)
- Role gating: super_admin/admin=all; grievance_officer=dashboard+grievances; pa_staff=most; constituency_coordinator=limited; media_team=content only

## User preferences

- Content defaults to Tamil. Keep Tamil translations populated for all new content.
- About page is CMS-editable from admin panel (stored in site_config, served publicly).

## Gotchas

- After OpenAPI changes, always run `pnpm --filter @workspace/api-spec run codegen` before touching frontend hooks.
- After adding new DB schema tables, run `cd lib/db && npx tsc -p tsconfig.json` to update declaration files.
- `lib/api-zod/src/index.ts` must export ONLY from `./generated/api`.
- Seed with `npx tsx lib/db/src/seed.ts` (pnpm exec tsx fails — tsx isn't a workspace dep).
- JWT_SECRET is ephemeral per dev restart — set `JWT_SECRET` env var for persistent sessions.

## Pointers

- `pnpm-workspace`, `react-vite`, `database`, `replit-auth` skills
