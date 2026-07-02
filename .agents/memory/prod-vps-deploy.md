---
name: Production VPS deploy quirks
description: Gotchas when the user deploys this app to their own VPS (pm2, port 5005, branch dev)
---

The user self-hosts on a VPS: git pull of branch `dev`, pnpm builds, `pm2 restart nirmal-connect-api`, API on port 5005.

- **Why:** Replit checkpoints auto-commit to `dev`, and the user pulls that branch to prod — anything committed here goes live on their next deploy.
- **How to apply:**
  - `drizzle-kit push` on the VPS needs `DATABASE_URL` exported in the shell (pm2 env vars are not visible to deploy shell commands).
  - Prod Postgres needed a one-time `CREATE EXTENSION IF NOT EXISTS pg_trgm;` before push (voters GIN index depends on it). Deploy script now includes it idempotently.
  - Files under `attached_assets/` are imported by frontend components via the `@assets` alias and ARE tracked in git; if someone deletes them on the VPS the Vite build fails with ENOENT — fix with `git checkout -- attached_assets/`.
  - When converting hardcoded frontend content to CMS/DB-driven, prod DB starts empty — ship an idempotent backfill seed script (see `lib/db/src/seed-development.ts` pattern: per-record title check inside a transaction) and tell the user to run it on the VPS.
