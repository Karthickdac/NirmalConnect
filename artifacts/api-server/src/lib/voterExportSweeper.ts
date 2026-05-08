// Voter-export retention sweeper (task #52).
//
// Task #48 saved each completed voter export to App Storage with a
// 7-day soft TTL on the audit row. The download endpoint already
// refuses to serve files past `expiresAt`, but the bytes themselves
// keep sitting in the bucket forever — slowly running up storage cost.
//
// This module closes the loop:
//   - `sweepExpiredVoterExports()` walks `voter_exports` rows where
//     `expiresAt < now` and `storageKey is not null`, deletes the
//     matching App Storage blob, and clears `storageKey` + `expiresAt`
//     on the row. Per-row failures are logged and skipped so one bad
//     blob can't abort the whole sweep.
//   - `startVoterExportSweeper()` runs the sweep on an in-process
//     daily timer. The interval handle is `unref`'d so it never holds
//     the event loop open during a graceful shutdown.
//
// Concurrency: a module-scoped `sweepInFlight` promise dedupes
// overlapping invocations (the route layer also triggers the sweep
// opportunistically on super-admin audit-log fetches — both paths
// share the same guard).

import { db } from "@workspace/db";
import { voterExportsTable } from "@workspace/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { deleteVoterExport } from "./objectStorage.js";
import { logger } from "./logger.js";

// Process at most this many rows per batch query. Loops until either
// no more expired rows are found or `MAX_BATCHES_PER_PASS` batches
// have been processed (a safety cap so a single sweep can't run
// unbounded if the table is enormous — the next daily tick picks up
// where this one left off).
const BATCH_SIZE = 200;
const MAX_BATCHES_PER_PASS = 50;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Small initial delay so the sweep doesn't fight the rest of startup
// (DB pool warmup, schema migrations, etc.).
const INITIAL_DELAY_MS = 60 * 1000;

let sweepInFlight: Promise<{ deleted: number; failed: number }> | null = null;

export async function sweepExpiredVoterExports(): Promise<{ deleted: number; failed: number }> {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    let deleted = 0;
    let failed = 0;
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_PASS; batch++) {
        const now = new Date();
        const expired = await db
          .select({
            id: voterExportsTable.id,
            storageKey: voterExportsTable.storageKey,
          })
          .from(voterExportsTable)
          .where(and(
            sql`${voterExportsTable.storageKey} is not null`,
            lte(voterExportsTable.expiresAt, now),
          ))
          .limit(BATCH_SIZE);
        if (expired.length === 0) break;

        for (const row of expired) {
          if (!row.storageKey) continue;
          try {
            await deleteVoterExport(row.storageKey);
          } catch (e) {
            failed++;
            logger.warn(
              { err: e, exportId: row.id },
              "[voter-export-sweeper] delete failed",
            );
            // Skip clearing the row so the next pass retries.
            continue;
          }
          try {
            await db.update(voterExportsTable)
              .set({ storageKey: null, expiresAt: null })
              .where(eq(voterExportsTable.id, row.id));
            deleted++;
          } catch (e) {
            failed++;
            logger.warn(
              { err: e, exportId: row.id },
              "[voter-export-sweeper] row update failed after blob delete",
            );
          }
        }

        // If this batch was short, the next query would just be empty —
        // bail early to avoid a redundant round-trip.
        if (expired.length < BATCH_SIZE) break;
      }
    } finally {
      sweepInFlight = null;
    }
    return { deleted, failed };
  })();
  return sweepInFlight;
}

let dailyTimer: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;

/** Start the in-process daily sweeper. Idempotent. */
export function startVoterExportSweeper(): void {
  if (dailyTimer || initialTimer) return;

  const runSweep = (): void => {
    void sweepExpiredVoterExports()
      .then((r) => {
        if (r.deleted > 0 || r.failed > 0) {
          logger.info(
            { deleted: r.deleted, failed: r.failed },
            "[voter-export-sweeper] pass complete",
          );
        }
      })
      .catch((err) => {
        logger.error({ err }, "[voter-export-sweeper] pass crashed");
      });
  };

  initialTimer = setTimeout(() => {
    initialTimer = null;
    runSweep();
    dailyTimer = setInterval(runSweep, ONE_DAY_MS);
    dailyTimer.unref?.();
  }, INITIAL_DELAY_MS);
  initialTimer.unref?.();
}

/** Stop the daily timer. Useful for tests. */
export function stopVoterExportSweeper(): void {
  if (initialTimer) { clearTimeout(initialTimer); initialTimer = null; }
  if (dailyTimer) { clearInterval(dailyTimer); dailyTimer = null; }
}
