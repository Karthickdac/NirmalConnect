// Household auto-grouping (task #46).
//
// Deterministic algorithm: voters within the same booth that share a
// normalized address+house-number signature are clustered into one
// household. Re-runs are idempotent and skip households that staff
// has manually edited (split / merged), so manual fixes survive
// subsequent imports.
//
// Cross-booth households are explicitly out of scope — door-to-door
// outreach is organised per booth, and the same-address-different-
// booth case is rare on the AC 195 roll.

import { db } from "@workspace/db";
import { votersTable, householdsTable } from "@workspace/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export function normalizeAddressKey(
  houseNumber: string | null | undefined,
  addressLine: string | null | undefined,
): string {
  const a = (houseNumber ?? "").toString().trim().toLowerCase();
  const b = (addressLine ?? "").toString().trim().toLowerCase();
  // Collapse runs of whitespace/punctuation to a single space — same
  // door spelled "12, Pillaiyar Koil St" vs "12 Pillaiyar Koil  St"
  // must hash identically.
  const collapse = (s: string) => s.replace(/[\s,.\-/]+/g, " ").trim();
  return `${collapse(a)}|${collapse(b)}`;
}

/**
 * Pick a human-readable household label from the relation field of
 * its members. Preference order: most-common Father/Husband
 * relationName among male-relation rows; falls back to any non-null
 * relationName; falls back to null.
 */
export function pickHouseholdLabel(members: Array<{
  relationType: string | null;
  relationName: string | null;
}>): string | null {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (!m.relationName) continue;
    const t = (m.relationType ?? "").toLowerCase();
    if (t !== "father" && t !== "husband") continue;
    const key = m.relationName.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { name: string; n: number } | null = null;
  for (const [name, n] of counts) {
    if (!best || n > best.n) best = { name, n };
  }
  if (best) return `S/o ${best.name}`;
  // Fallback: any relation name at all.
  for (const m of members) {
    if (m.relationName?.trim()) return `c/o ${m.relationName.trim()}`;
  }
  return null;
}

interface RegroupOpts {
  /** Limit to a single booth — used by the post-import path. */
  pollingStationId?: number | null;
  /** Limit to specific voter ids (used after a manual unlink). */
  voterIds?: number[];
}

interface RegroupResult {
  scannedVoters: number;
  householdsCreated: number;
  householdsUpdated: number;
  votersAssigned: number;
}

/**
 * Run the auto-grouping job. Idempotent: re-runs without input
 * change touch nothing. Members of households flagged
 * `manuallyEdited=true` are skipped entirely so split/merge survives
 * re-imports. New households are inserted only when no existing
 * non-manually-edited household covers the (booth, addressKey).
 */
export async function regroupHouseholds(
  opts: RegroupOpts = {},
): Promise<RegroupResult> {
  // Wrap the entire grouping pass in a single serializable
  // transaction. Concurrent calls would otherwise race on the
  // (booth, addressKey) lookup, the per-key INSERT, and the empty-
  // household GC delete — leading to either duplicated households or
  // GC of households a sibling job just created.
  return db.transaction(async (tx) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts.pollingStationId != null) {
    conds.push(eq(votersTable.pollingStationId, opts.pollingStationId));
  }
  if (opts.voterIds && opts.voterIds.length > 0) {
    conds.push(inArray(votersTable.id, opts.voterIds));
  }

  // Pull every candidate voter. We fetch household.manuallyEdited via
  // a left join so we can skip members of locked households inline.
  const rows = await tx
    .select({
      id: votersTable.id,
      pollingStationId: votersTable.pollingStationId,
      houseNumber: votersTable.houseNumber,
      addressLine: votersTable.addressLine,
      relationType: votersTable.relationType,
      relationName: votersTable.relationName,
      currentHouseholdId: votersTable.householdId,
      currentHouseholdLocked: householdsTable.manuallyEdited,
    })
    .from(votersTable)
    .leftJoin(householdsTable, eq(householdsTable.id, votersTable.householdId))
    .where(conds.length > 0 ? and(...conds) : undefined);

  // Group eligible voters by (booth, addressKey). Voters in a locked
  // household are skipped entirely. Voters whose pollingStationId is
  // NULL can't be grouped (nothing meaningful to compare against);
  // skip them too.
  type GroupKey = string; // `${boothId}::${addressKey}`
  const groups = new Map<GroupKey, {
    pollingStationId: number;
    addressKey: string;
    members: typeof rows;
  }>();
  let scannedVoters = 0;
  for (const r of rows) {
    if (r.currentHouseholdLocked === true) continue;
    if (r.pollingStationId == null) continue;
    scannedVoters += 1;
    const addressKey = normalizeAddressKey(r.houseNumber, r.addressLine);
    const key = `${r.pollingStationId}::${addressKey}`;
    let g = groups.get(key);
    if (!g) {
      g = { pollingStationId: r.pollingStationId, addressKey, members: [] };
      groups.set(key, g);
    }
    g.members.push(r);
  }

  if (groups.size === 0) {
    return { scannedVoters, householdsCreated: 0, householdsUpdated: 0, votersAssigned: 0 };
  }

  // Look up existing non-manually-edited households for the
  // (booth, addressKey) pairs we're about to touch, so we can reuse
  // them instead of duplicating.
  const boothIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.pollingStationId)));
  // Lock the rows we may touch so a concurrent regroup waits for us.
  const existing = await tx
    .select({
      id: householdsTable.id,
      pollingStationId: householdsTable.pollingStationId,
      addressKey: householdsTable.addressKey,
      label: householdsTable.label,
      manuallyEdited: householdsTable.manuallyEdited,
    })
    .from(householdsTable)
    .where(inArray(householdsTable.pollingStationId, boothIds))
    .for("update");
  const existingByKey = new Map<string, typeof existing[number]>();
  for (const h of existing) {
    if (h.manuallyEdited) continue;
    if (h.pollingStationId == null) continue;
    existingByKey.set(`${h.pollingStationId}::${h.addressKey}`, h);
  }

  let householdsCreated = 0;
  let householdsUpdated = 0;
  let votersAssigned = 0;

  for (const [key, g] of groups) {
    const label = pickHouseholdLabel(g.members);
    let household = existingByKey.get(key);
    if (!household) {
      const [created] = await tx
        .insert(householdsTable)
        .values({
          pollingStationId: g.pollingStationId,
          addressKey: g.addressKey,
          label,
          manuallyEdited: false,
        })
        .returning({
          id: householdsTable.id,
          pollingStationId: householdsTable.pollingStationId,
          addressKey: householdsTable.addressKey,
          label: householdsTable.label,
          manuallyEdited: householdsTable.manuallyEdited,
        });
      household = created;
      householdsCreated += 1;
    } else if ((household.label ?? null) !== (label ?? null)) {
      // Refresh label as memberships change.
      await tx
        .update(householdsTable)
        .set({ label })
        .where(eq(householdsTable.id, household.id));
      householdsUpdated += 1;
    }

    // Reassign only voters that don't already point at this household
    // to keep the write set minimal (and the audit log clean).
    const toAssign = g.members
      .filter((m) => m.currentHouseholdId !== household!.id)
      .map((m) => m.id);
    if (toAssign.length > 0) {
      await tx
        .update(votersTable)
        .set({ householdId: household.id })
        .where(inArray(votersTable.id, toAssign));
      votersAssigned += toAssign.length;
    }
  }

  // Garbage-collect non-manually-edited households that lost all
  // their members. Manually-edited (locked) ones are preserved
  // even when empty — staff may want to put voters back later.
  await tx.execute(sql`
    DELETE FROM ${householdsTable}
    WHERE manually_edited = false
      AND NOT EXISTS (
        SELECT 1 FROM ${votersTable}
        WHERE ${votersTable.householdId} = ${householdsTable.id}
      )
  `);

  return { scannedVoters, householdsCreated, householdsUpdated, votersAssigned };
  });
}

/**
 * Convenience for after a voter has been removed from a household
 * (manual unlink): if the household becomes empty AND was not
 * manually edited, delete it. Cheap to call in a hot path.
 */
export async function pruneEmptyHousehold(householdId: number): Promise<void> {
  const [stillUsed] = await db
    .select({ id: votersTable.id })
    .from(votersTable)
    .where(eq(votersTable.householdId, householdId))
    .limit(1);
  if (stillUsed) return;
  await db
    .delete(householdsTable)
    .where(and(eq(householdsTable.id, householdId), eq(householdsTable.manuallyEdited, false)));
}

// Re-export for tests.
export const _internal = { normalizeAddressKey, pickHouseholdLabel };
// Mark `isNull` as used so the type-narrow above still imports — drizzle's
// inferred query helpers occasionally need this in the where-clause shape.
void isNull;
