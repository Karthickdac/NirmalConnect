// Voter scope helper.
//
// Determines which voters a given staff user is allowed to see,
// based on their role + officerAssignmentsTable rows.
//
//   - super_admin / admin / minister  → unrestricted (no scope filter)
//   - other staff (officers, etc.)    → scoped by ward / area / booth
//
// The scope is expressed as three id sets. A voter is considered
// in-scope if its pollingStationId belongs to ANY of:
//   - pollingStationIds          (direct booth assignment)
//   - any booth in areaIds       (resolved via polling_stations.area_id)
//   - any booth in wardIds       (resolved via polling_stations.ward_id)
//
// Callers should treat `unrestricted: true` as "skip the scope filter".
import { db } from "@workspace/db";
import { officerAssignmentsTable, pollingStationsTable, areasTable } from "@workspace/db/schema";
import { eq, inArray, and } from "drizzle-orm";

export interface VoterScope {
  unrestricted: boolean;
  wardIds: number[];
  areaIds: number[];
  pollingStationIds: number[];
}

// Per task #43 access policy: ONLY super_admin and admin see the
// constituency-wide voter list. Every other staff role (including
// minister, coordinators, officers, pa_staff) is filtered through
// their officer assignments — keeping voter PII exposure to the
// minimum each role actually needs.
const UNRESTRICTED_ROLES = new Set(["super_admin", "admin"]);

export interface ScopeUser {
  id: number;
  role: string;
}

export async function getVoterScopeForUser(user: ScopeUser): Promise<VoterScope> {
  if (UNRESTRICTED_ROLES.has(user.role)) {
    return { unrestricted: true, wardIds: [], areaIds: [], pollingStationIds: [] };
  }

  const rows = await db
    .select({
      wardId: officerAssignmentsTable.wardId,
      areaId: officerAssignmentsTable.areaId,
      pollingStationId: officerAssignmentsTable.pollingStationId,
    })
    .from(officerAssignmentsTable)
    .where(and(
      eq(officerAssignmentsTable.userId, user.id),
      // Inactive (revoked) assignments must NOT grant voter visibility.
      eq(officerAssignmentsTable.isActive, true),
    ));

  const wardIds = new Set<number>();
  const areaIds = new Set<number>();
  const pollingStationIds = new Set<number>();
  for (const r of rows) {
    if (r.pollingStationId != null) pollingStationIds.add(r.pollingStationId);
    else if (r.areaId != null) areaIds.add(r.areaId);
    else if (r.wardId != null) wardIds.add(r.wardId);
  }

  return {
    unrestricted: false,
    wardIds: Array.from(wardIds),
    areaIds: Array.from(areaIds),
    pollingStationIds: Array.from(pollingStationIds),
  };
}

/**
 * Resolve a VoterScope down to the concrete set of polling-station ids
 * that contain in-scope voters. Returns null if `unrestricted`.
 *
 * Empty scope → returns []  (caller should treat as "no results").
 */
export async function resolveScopeBoothIds(scope: VoterScope): Promise<number[] | null> {
  if (scope.unrestricted) return null;

  const ids = new Set<number>(scope.pollingStationIds);

  if (scope.areaIds.length > 0) {
    const rows = await db
      .select({ id: pollingStationsTable.id })
      .from(pollingStationsTable)
      .where(inArray(pollingStationsTable.areaId, scope.areaIds));
    for (const r of rows) ids.add(r.id);
  }

  if (scope.wardIds.length > 0) {
    // Pull every booth whose ward_id matches OR whose area sits in one of the wards.
    const direct = await db
      .select({ id: pollingStationsTable.id })
      .from(pollingStationsTable)
      .where(inArray(pollingStationsTable.wardId, scope.wardIds));
    for (const r of direct) ids.add(r.id);

    const areasInWards = await db
      .select({ id: areasTable.id })
      .from(areasTable)
      .where(inArray(areasTable.wardId, scope.wardIds));
    const areaIds = areasInWards.map((a) => a.id);
    if (areaIds.length > 0) {
      const viaArea = await db
        .select({ id: pollingStationsTable.id })
        .from(pollingStationsTable)
        .where(inArray(pollingStationsTable.areaId, areaIds));
      for (const r of viaArea) ids.add(r.id);
    }
  }

  return Array.from(ids);
}

// ── Shared ordering for the Voters list ─────────────────────────────
// IMPORTANT: any route that returns voters in the same order as the
// admin Voters table MUST use this helper. Keeping the logic in one
// place is what makes the export's "matches on-screen exactly"
// guarantee enforceable — search and export call the same function
// with the same `q`, so tied rows fall in the same order in both.
import { sql, desc, type SQL } from "drizzle-orm";
import { votersTable } from "@workspace/db/schema";

export const VOTER_EPIC_RE = /^[A-Z]{3}\d{7}$/i;

export function voterListOrderBy(q?: string | null): SQL[] {
  if (q && VOTER_EPIC_RE.test(q)) return [desc(votersTable.id)];
  if (q && q.length >= 2) {
    return [desc(sql`similarity(lower(${votersTable.fullName}), ${q.toLowerCase()})`)];
  }
  return [desc(votersTable.id)];
}
