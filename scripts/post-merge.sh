#!/bin/bash
set -e
pnpm install --frozen-lockfile
node -e "
const { Pool } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;')
  .then(() => pool.end())
  .catch(e => { console.error('pg_trgm:', e.message); pool.end(); });
"
pnpm --filter @workspace/db run push
