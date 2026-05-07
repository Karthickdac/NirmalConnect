// Household routes (task #46).
//
// Households cluster voters that live at the same door within one
// polling station. Endpoints below mirror the voter-scope policy:
// officers see only households whose booth they're assigned to;
// admins see everything. Every read/write is audited.
import { Router } from "express";
import { db } from "@workspace/db";
import {
  votersTable, householdsTable, pollingStationsTable, auditLogTable,
  voterTagsTable, voterTagAssignmentsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, type AuthRequest } from "../lib/auth.js";
import { getVoterScopeForUser, resolveScopeBoothIds } from "../lib/voterScope.js";
import {
  regroupHouseholds, normalizeAddressKey, pickHouseholdLabel,
  pruneEmptyHousehold,
} from "../lib/households.js";

const router = Router();

async function logHouseholdAudit(
  req: AuthRequest, action: string, target: string, detail?: string | null,
) {
  try {
    await db.insert(auditLogTable).values({
      actorId: req.user?.id ?? null,
      actorName: req.user?.name ?? "Unknown",
      action,
      target,
      detail: detail ?? null,
    });
  } catch {
    /* non-critical */
  }
}

/**
 * Resolve the booth ids in scope for the current user. Returns:
 *   - null if unrestricted (admins)
 *   - [] if the user has no booth access (returns empty results)
 *   - number[] otherwise
 */
async function getScopedBooths(user: { id: number; role: string }) {
  const scope = await getVoterScopeForUser(user);
  if (scope.unrestricted) return null;
  return (await resolveScopeBoothIds(scope)) ?? [];
}

async function householdInScope(
  user: { id: number; role: string },
  householdId: number,
): Promise<{ id: number; pollingStationId: number | null; manuallyEdited: boolean } | null> {
  const [row] = await db
    .select({
      id: householdsTable.id,
      pollingStationId: householdsTable.pollingStationId,
      manuallyEdited: householdsTable.manuallyEdited,
    })
    .from(householdsTable)
    .where(eq(householdsTable.id, householdId))
    .limit(1);
  if (!row) return null;
  const scopedBooths = await getScopedBooths(user);
  if (scopedBooths === null) return row;
  if (row.pollingStationId == null) return null;
  if (!scopedBooths.includes(row.pollingStationId)) return null;
  return row;
}

// ── GET /api/admin/households — paginated list ───────────────
//
// Filters:
//   - boothId: limit to one booth
//   - q: substring match against label/address
//   - tagAll: comma-separated tag ids; only households where the
//             member tag set covers ALL of these is returned
//             ("households with ≥1 Supporter AND ≥1 Undecided").
const listQuerySchema = z.object({
  boothId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).optional(),
  tagAll: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get("/admin/households", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { boothId, q, tagAll: tagAllRaw, page, limit } = parsed.data;
    const tagAll = (tagAllRaw ?? "")
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const scopedBooths = await getScopedBooths(req.user);
    if (scopedBooths !== null && scopedBooths.length === 0) {
      res.json({ items: [], total: 0, page, limit, hasMore: false });
      return;
    }

    const conds: ReturnType<typeof eq>[] = [];
    if (scopedBooths !== null) {
      conds.push(inArray(householdsTable.pollingStationId, scopedBooths));
    }
    if (boothId) {
      if (scopedBooths !== null && !scopedBooths.includes(boothId)) {
        res.json({ items: [], total: 0, page, limit, hasMore: false });
        return;
      }
      conds.push(eq(householdsTable.pollingStationId, boothId));
    }
    if (q && q.length >= 2) {
      const like = `%${q.toLowerCase()}%`;
      conds.push(sql`(lower(${householdsTable.label}) ILIKE ${like} OR lower(${householdsTable.addressKey}) ILIKE ${like})`);
    }
    if (tagAll.length > 0) {
      // "Has at least one member with each tag" — require, for every
      // requested tag id, at least one voter in this household carrying
      // that tag.
      for (const tagId of tagAll) {
        conds.push(sql`EXISTS (
          SELECT 1 FROM ${votersTable}
          INNER JOIN ${voterTagAssignmentsTable}
            ON ${voterTagAssignmentsTable.voterId} = ${votersTable.id}
          WHERE ${votersTable.householdId} = ${householdsTable.id}
            AND ${voterTagAssignmentsTable.tagId} = ${tagId}
        )`);
      }
    }

    const where = conds.length > 0 ? and(...conds) : undefined;
    const offset = (page - 1) * limit;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: householdsTable.id,
          pollingStationId: householdsTable.pollingStationId,
          addressKey: householdsTable.addressKey,
          label: householdsTable.label,
          manuallyEdited: householdsTable.manuallyEdited,
          boothNo: pollingStationsTable.boothNo,
          boothName: pollingStationsTable.name,
          memberCount: sql<number>`(
            SELECT count(*)::int FROM ${votersTable}
            WHERE ${votersTable.householdId} = ${householdsTable.id}
          )`,
        })
        .from(householdsTable)
        .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, householdsTable.pollingStationId))
        .where(where)
        .orderBy(desc(householdsTable.id))
        .limit(limit)
        .offset(offset),
      db.select({ n: sql<number>`count(*)::int` })
        .from(householdsTable)
        .where(where),
    ]);

    const total = totalRow[0]?.n ?? 0;
    await logHouseholdAudit(
      req, "HOUSEHOLD_LIST", "households",
      `q=${q ?? ""};total=${total};page=${page}`,
    );
    res.json({ items: rows, total, page, limit, hasMore: offset + rows.length < total });
  } catch (err) {
    console.error("[households] list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/households/:id — detail with members ───────
router.get("/admin/households/:id", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const inScope = await householdInScope(req.user, id);
    if (!inScope) {
      await logHouseholdAudit(req, "HOUSEHOLD_DETAIL_DENIED", `households:${id}`, "out_of_scope_or_missing");
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [head] = await db
      .select({
        id: householdsTable.id,
        pollingStationId: householdsTable.pollingStationId,
        addressKey: householdsTable.addressKey,
        label: householdsTable.label,
        manuallyEdited: householdsTable.manuallyEdited,
        createdAt: householdsTable.createdAt,
        updatedAt: householdsTable.updatedAt,
        boothNo: pollingStationsTable.boothNo,
        boothName: pollingStationsTable.name,
      })
      .from(householdsTable)
      .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, householdsTable.pollingStationId))
      .where(eq(householdsTable.id, id))
      .limit(1);
    const members = await db
      .select({
        id: votersTable.id,
        epicNumber: votersTable.epicNumber,
        fullName: votersTable.fullName,
        fullNameTa: votersTable.fullNameTa,
        age: votersTable.age,
        gender: votersTable.gender,
        relationType: votersTable.relationType,
        relationName: votersTable.relationName,
        houseNumber: votersTable.houseNumber,
      })
      .from(votersTable)
      .where(eq(votersTable.householdId, id))
      .orderBy(asc(votersTable.id));

    // Summarize tag composition so the UI can render quick chips.
    const tagRows = members.length === 0 ? [] : await db
      .select({
        tagId: voterTagAssignmentsTable.tagId,
        name: voterTagsTable.name,
        nameTa: voterTagsTable.nameTa,
        color: voterTagsTable.color,
        count: sql<number>`count(*)::int`,
      })
      .from(voterTagAssignmentsTable)
      .innerJoin(voterTagsTable, eq(voterTagsTable.id, voterTagAssignmentsTable.tagId))
      .where(inArray(voterTagAssignmentsTable.voterId, members.map((m) => m.id)))
      .groupBy(voterTagAssignmentsTable.tagId, voterTagsTable.name, voterTagsTable.nameTa, voterTagsTable.color)
      .orderBy(desc(sql`count(*)`));

    await logHouseholdAudit(req, "HOUSEHOLD_DETAIL", `households:${id}`, `members=${members.length}`);
    res.json({
      ...head,
      createdAt: head!.createdAt.toISOString(),
      updatedAt: head!.updatedAt.toISOString(),
      members,
      tagSummary: tagRows,
    });
  } catch (err) {
    console.error("[households] detail:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/households/:id/split ─────────────────────
//
// Move the listed voter ids OUT of this household and into a brand
// new household at the same booth (auto-labelled from the new
// members). Both source and destination households are flagged
// `manuallyEdited` so auto-grouping won't undo the split.
const splitBodySchema = z.object({
  voterIds: z.array(z.number().int().positive()).min(1).max(100),
});

router.post("/admin/households/:id/split", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.user.role !== "super_admin" && req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const body = splitBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid", details: body.error.flatten() });
      return;
    }
    const source = await householdInScope(req.user, id);
    if (!source || source.pollingStationId == null) {
      await logHouseholdAudit(req, "HOUSEHOLD_SPLIT_DENIED", `households:${id}`, "out_of_scope_or_missing");
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Confirm every requested voter currently belongs to this household.
    const moving = await db
      .select({
        id: votersTable.id,
        houseNumber: votersTable.houseNumber,
        addressLine: votersTable.addressLine,
        relationType: votersTable.relationType,
        relationName: votersTable.relationName,
        householdId: votersTable.householdId,
      })
      .from(votersTable)
      .where(inArray(votersTable.id, body.data.voterIds));
    const valid = moving.filter((m) => m.householdId === id);
    if (valid.length === 0) {
      res.status(400).json({ error: "No matching voters in this household" });
      return;
    }

    const addressKey = normalizeAddressKey(valid[0]!.houseNumber, valid[0]!.addressLine);
    const label = pickHouseholdLabel(valid);

    const [created] = await db
      .insert(householdsTable)
      .values({
        pollingStationId: source.pollingStationId,
        addressKey,
        label,
        manuallyEdited: true,
      })
      .returning();

    await db
      .update(votersTable)
      .set({ householdId: created!.id })
      .where(inArray(votersTable.id, valid.map((v) => v.id)));

    // Lock the source household too, otherwise the next auto-grouping
    // pass would happily re-merge whatever address-matching members
    // remain.
    await db
      .update(householdsTable)
      .set({ manuallyEdited: true })
      .where(eq(householdsTable.id, id));

    // If the source emptied out, remove it.
    await pruneEmptyHousehold(id);

    await logHouseholdAudit(
      req, "HOUSEHOLD_SPLIT",
      `households:${id}`,
      `new=${created!.id} moved=${valid.length}`,
    );
    res.json({ ok: true, newHouseholdId: created!.id, movedCount: valid.length });
  } catch (err) {
    console.error("[households] split:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/households/merge ─────────────────────────
//
// Merge `sourceId` into `targetId`. Both must be in the same booth
// (cross-booth merges are explicitly out of scope per task spec).
const mergeBodySchema = z.object({
  sourceId: z.number().int().positive(),
  targetId: z.number().int().positive(),
});

router.post("/admin/households/merge", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.user.role !== "super_admin" && req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const body = mergeBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid", details: body.error.flatten() });
      return;
    }
    const { sourceId, targetId } = body.data;
    if (sourceId === targetId) {
      res.status(400).json({ error: "Source and target must differ" });
      return;
    }
    const src = await householdInScope(req.user, sourceId);
    const tgt = await householdInScope(req.user, targetId);
    if (!src || !tgt) {
      await logHouseholdAudit(req, "HOUSEHOLD_MERGE_DENIED", `households:${sourceId}->${targetId}`, "out_of_scope_or_missing");
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (src.pollingStationId !== tgt.pollingStationId) {
      res.status(400).json({ error: "Cross-booth merges are not supported" });
      return;
    }

    // Move all voters; lock the destination so auto-grouping doesn't
    // split them back apart by address differences. Then drop the
    // emptied source household.
    const moved = await db
      .update(votersTable)
      .set({ householdId: targetId })
      .where(eq(votersTable.householdId, sourceId))
      .returning({ id: votersTable.id });

    await db
      .update(householdsTable)
      .set({ manuallyEdited: true })
      .where(eq(householdsTable.id, targetId));

    await db
      .delete(householdsTable)
      .where(eq(householdsTable.id, sourceId));

    await logHouseholdAudit(
      req, "HOUSEHOLD_MERGE",
      `households:${sourceId}->${targetId}`,
      `moved=${moved.length}`,
    );
    res.json({ ok: true, movedCount: moved.length, targetId });
  } catch (err) {
    console.error("[households] merge:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/households/regroup ───────────────────────
//
// Manually re-trigger the auto-grouping job. Restricted to admins
// (super_admin/admin) — officers don't need this hammer.
router.post("/admin/households/regroup", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const role = req.user.role;
    if (role !== "super_admin" && role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const r = await regroupHouseholds();
    await logHouseholdAudit(
      req, "HOUSEHOLD_AUTOGROUP_MANUAL", "households",
      `scanned=${r.scannedVoters} +${r.householdsCreated}/~${r.householdsUpdated} assigned=${r.votersAssigned}`,
    );
    res.json({ ok: true, ...r });
  } catch (err) {
    console.error("[households] regroup:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
