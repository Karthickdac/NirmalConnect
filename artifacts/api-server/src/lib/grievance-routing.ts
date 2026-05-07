import { db } from "@workspace/db";
import {
  officerAssignmentsTable,
  grievancesTable,
  grievanceRoutingLogTable,
  usersTable,
  areasTable,
  pollingStationsTable,
  wardsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, sql, asc } from "drizzle-orm";

/**
 * Result of resolving the auto-routing target for an incoming grievance.
 *  - officerId: chosen owner (null if no rule matches)
 *  - matchedScope: which level matched ("booth" | "area" | "ward" | "none")
 *  - matchedScopeId: the id of the matched ward/area/booth (or null)
 *  - candidateCount: how many officers were eligible (for round-robin transparency)
 */
export interface RoutingResult {
  officerId: number | null;
  matchedScope: "booth" | "area" | "ward" | "none";
  matchedScopeId: number | null;
  candidateCount: number;
}

interface ResolveInput {
  wardName?: string | null;     // free-text ward name from form
  wardId?: number | null;       // when explicitly chosen by id
  areaId?: number | null;
  pollingStationId?: number | null;
}

/**
 * Look up the wardId from a free-text ward name, if any. The Grievance form
 * historically captures ward as a string (matching wardsTable.name) — we resolve
 * back to id so the routing rules can be evaluated consistently.
 */
export async function resolveWardId(input: ResolveInput): Promise<number | null> {
  if (input.wardId != null) return input.wardId;
  if (!input.wardName) return null;
  const [w] = await db
    .select({ id: wardsTable.id })
    .from(wardsTable)
    .where(eq(wardsTable.name, input.wardName))
    .limit(1);
  return w?.id ?? null;
}

/**
 * Pick the active officer with the smallest open caseload from a list of
 * candidate user ids. "Open" = grievances assigned to that officer whose
 * status is not Resolved/Closed. Round-robin tie-break: among officers
 * with equal caseload, pick the one whose id rotates next vs the most
 * recent auto-routing log entry.
 */
async function pickByLoadAndRoundRobin(candidateIds: number[]): Promise<number | null> {
  if (candidateIds.length === 0) return null;
  if (candidateIds.length === 1) return candidateIds[0];

  // Open caseload per candidate
  const loadRows = await db
    .select({
      officerId: grievancesTable.assignedTo,
      load: sql<number>`count(*)::int`,
    })
    .from(grievancesTable)
    .where(
      and(
        inArray(grievancesTable.assignedTo, candidateIds),
        sql`${grievancesTable.status} NOT IN ('Resolved','Closed')`,
      ),
    )
    .groupBy(grievancesTable.assignedTo);

  const loadMap = new Map<number, number>();
  for (const r of loadRows) {
    if (r.officerId != null) loadMap.set(r.officerId, Number(r.load));
  }
  for (const id of candidateIds) if (!loadMap.has(id)) loadMap.set(id, 0);

  const minLoad = Math.min(...candidateIds.map((id) => loadMap.get(id) ?? 0));
  const tied = candidateIds.filter((id) => (loadMap.get(id) ?? 0) === minLoad).sort((a, b) => a - b);
  if (tied.length === 1) return tied[0];

  // Round-robin: find the most-recent auto routing target among tied set
  // and pick the next one in rotation.
  const [last] = await db
    .select({ to: grievanceRoutingLogTable.toOfficerId })
    .from(grievanceRoutingLogTable)
    .where(
      and(
        eq(grievanceRoutingLogTable.reason, "auto"),
        inArray(grievanceRoutingLogTable.toOfficerId, tied),
      ),
    )
    .orderBy(sql`${grievanceRoutingLogTable.createdAt} desc`)
    .limit(1);

  if (last?.to == null) return tied[0];
  const idx = tied.indexOf(last.to);
  return tied[(idx + 1) % tied.length];
}

/**
 * Resolve which officer should own an incoming grievance.
 * Tries booth → area → ward in that order; first level with at least one
 * active assignment wins. Returns { officerId: null, scope: 'none' } if
 * nothing matches (caller falls back to the shared inbox).
 */
export async function resolveOwnerForGrievance(input: ResolveInput): Promise<RoutingResult> {
  const wardId = await resolveWardId(input);

  // 1) Booth-specific assignments
  if (input.pollingStationId) {
    const rows = await db
      .select({ userId: officerAssignmentsTable.userId })
      .from(officerAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, officerAssignmentsTable.userId))
      .where(and(
        eq(officerAssignmentsTable.pollingStationId, input.pollingStationId),
        eq(officerAssignmentsTable.isActive, true),
        eq(usersTable.isActive, "true"),
      ));
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    if (ids.length > 0) {
      const officerId = await pickByLoadAndRoundRobin(ids);
      return { officerId, matchedScope: "booth", matchedScopeId: input.pollingStationId, candidateCount: ids.length };
    }
  }

  // 2) Area-specific assignments
  if (input.areaId) {
    const rows = await db
      .select({ userId: officerAssignmentsTable.userId })
      .from(officerAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, officerAssignmentsTable.userId))
      .where(and(
        eq(officerAssignmentsTable.areaId, input.areaId),
        isNull(officerAssignmentsTable.pollingStationId),
        eq(officerAssignmentsTable.isActive, true),
        eq(usersTable.isActive, "true"),
      ));
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    if (ids.length > 0) {
      const officerId = await pickByLoadAndRoundRobin(ids);
      return { officerId, matchedScope: "area", matchedScopeId: input.areaId, candidateCount: ids.length };
    }
  }

  // 3) Ward-only assignments (and any assignment whose area/booth match the ward)
  if (wardId) {
    const rows = await db
      .select({ userId: officerAssignmentsTable.userId })
      .from(officerAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, officerAssignmentsTable.userId))
      .where(and(
        eq(officerAssignmentsTable.wardId, wardId),
        isNull(officerAssignmentsTable.areaId),
        isNull(officerAssignmentsTable.pollingStationId),
        eq(officerAssignmentsTable.isActive, true),
        eq(usersTable.isActive, "true"),
      ));
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    if (ids.length > 0) {
      const officerId = await pickByLoadAndRoundRobin(ids);
      return { officerId, matchedScope: "ward", matchedScopeId: wardId, candidateCount: ids.length };
    }
  }

  return { officerId: null, matchedScope: "none", matchedScopeId: null, candidateCount: 0 };
}

/**
 * Persist a routing-log row. Safe to call from any code path; never throws.
 */
export async function logRouting(args: {
  grievanceId: number;
  fromOfficerId: number | null;
  toOfficerId: number | null;
  reason: "auto" | "manual" | "reassign" | "unassigned";
  matchedScope: "booth" | "area" | "ward" | "none";
  matchedScopeId: number | null;
  changedBy: number | null;
  changedByName: string;
  note?: string | null;
}): Promise<void> {
  try {
    await db.insert(grievanceRoutingLogTable).values({
      grievanceId: args.grievanceId,
      fromOfficerId: args.fromOfficerId,
      toOfficerId: args.toOfficerId,
      reason: args.reason,
      matchedScope: args.matchedScope,
      matchedScopeId: args.matchedScopeId,
      changedBy: args.changedBy,
      changedByName: args.changedByName,
      note: args.note ?? null,
    });
  } catch (err) {
    console.error("[grievance-routing] log error:", err);
  }
}

/**
 * Sanity-check that an areaId belongs to the given ward (if both supplied).
 * Returns true if OK or if either side is missing.
 */
export async function validateAreaInWard(areaId: number | null | undefined, wardId: number | null): Promise<boolean> {
  if (!areaId || !wardId) return true;
  const [a] = await db.select({ wardId: areasTable.wardId }).from(areasTable).where(eq(areasTable.id, areaId)).limit(1);
  return !!a && a.wardId === wardId;
}

/** Same for polling station (booth → ward). */
export async function validateBoothInWard(boothId: number | null | undefined, wardId: number | null): Promise<boolean> {
  if (!boothId || !wardId) return true;
  const [b] = await db.select({ wardId: pollingStationsTable.wardId }).from(pollingStationsTable).where(eq(pollingStationsTable.id, boothId)).limit(1);
  return !!b && (b.wardId == null || b.wardId === wardId);
}

/** Order helpers re-exported so callers don't need a second drizzle import. */
export const orderById = asc;
