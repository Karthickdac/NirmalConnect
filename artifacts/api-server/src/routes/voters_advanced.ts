// Voters advanced routes — Phase 1B/2/3 of the comprehensive Voters
// module rebuild. Lives here (not voters.ts) because voters.ts is
// already 1,795 lines and these endpoints are conceptually distinct
// (merge / bulk attribute ops / contact log / relations / timeline /
// segments / analytics / callsheet) from import + search + tags.
//
// All endpoints super_admin-only via requireVoterScope unless noted.

import { Router } from "express";
import { db } from "@workspace/db";
import {
  votersTable,
  voterTagsTable,
  voterTagAssignmentsTable,
  voterNotesTable,
  voterContactLogTable,
  voterRelationsTable,
  voterSegmentsTable,
  pollingStationsTable,
  grievancesTable,
  auditLogTable,
  VOTER_CONTACT_TYPES,
  VOTER_CONTACT_DIRECTIONS,
  VOTER_CONTACT_OUTCOMES,
  VOTER_RELATION_KINDS,
} from "@workspace/db/schema";
import { eq, and, or, sql, inArray, desc, asc, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, requireRole, type AuthRequest } from "../lib/auth.js";

const router = Router();

const requireVoterScope = [requireStaff, requireRole("super_admin")] as const;

const EPIC_RE = /^[A-Z]{3}\d{7}$/i;

async function logAudit(
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
  } catch (e) {
    console.warn("[voters_advanced] audit failed:", e);
  }
}

// Shared filter schema — same shape as bulk-delete so segments and
// callsheets reuse it. Kept narrow on purpose; new fields require
// explicit code review here AND in resolveVoterIdsByFilter() below.
const voterFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  boothId: z.coerce.number().int().positive().optional(),
  wardId: z.coerce.number().int().positive().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
  minAge: z.coerce.number().int().min(0).max(150).optional(),
  maxAge: z.coerce.number().int().min(0).max(150).optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
  epicPrefix: z.string().trim().max(40).optional(),
  hasPhone: z.boolean().optional(),
  whatsappOptIn: z.boolean().optional(),
});
type VoterFilter = z.infer<typeof voterFilterSchema>;

// Build the WHERE expression list for a given filter. Returns null if
// the filter resolves to "no possible matches" (e.g. wardId references
// a ward with zero booths) so the caller can short-circuit.
async function buildVoterFilterConds(f: VoterFilter): Promise<ReturnType<typeof eq>[] | null> {
  const conds: ReturnType<typeof eq>[] = [];
  if (f.boothId) conds.push(eq(votersTable.pollingStationId, f.boothId));
  if (f.wardId) {
    const wardBooths = await db
      .select({ id: pollingStationsTable.id })
      .from(pollingStationsTable)
      .where(eq(pollingStationsTable.wardId, f.wardId));
    const ids = wardBooths.map((b) => b.id);
    if (ids.length === 0) return null;
    conds.push(inArray(votersTable.pollingStationId, ids));
  }
  if (f.gender) conds.push(eq(votersTable.gender, f.gender));
  if (f.minAge != null) conds.push(gte(votersTable.age, f.minAge));
  if (f.maxAge != null) conds.push(lte(votersTable.age, f.maxAge));
  if (f.tagIds && f.tagIds.length > 0) {
    const tagged = db
      .select({ vid: voterTagAssignmentsTable.voterId })
      .from(voterTagAssignmentsTable)
      .where(inArray(voterTagAssignmentsTable.tagId, f.tagIds));
    conds.push(inArray(votersTable.id, tagged));
  }
  if (f.epicPrefix) {
    conds.push(sql`${votersTable.epicNumber} LIKE ${f.epicPrefix + "%"}`);
  }
  if (f.hasPhone === true) conds.push(sql`${votersTable.phone} IS NOT NULL AND ${votersTable.phone} <> ''`);
  if (f.hasPhone === false) conds.push(sql`(${votersTable.phone} IS NULL OR ${votersTable.phone} = '')`);
  if (f.whatsappOptIn === true) conds.push(eq(votersTable.whatsappOptIn, true));
  if (f.whatsappOptIn === false) conds.push(eq(votersTable.whatsappOptIn, false));
  if (f.q) {
    if (EPIC_RE.test(f.q)) {
      conds.push(eq(votersTable.epicNumber, f.q.toUpperCase()));
    } else {
      const like = `%${f.q.toLowerCase()}%`;
      conds.push(or(
        sql`lower(${votersTable.fullName}) ILIKE ${like}`,
        sql`${votersTable.fullNameTa} ILIKE ${like}`,
      )!);
    }
  }
  return conds;
}

// =============================================================
// T106 — Duplicates + Merge
// =============================================================

// GET /api/admin/voters/duplicates
//
// Returns groups of voters that look like duplicates, keyed by
//   (lower(full_name), age, polling_station_id)
// HAVING count > 1 — i.e. same name + age + booth. We deliberately
// do NOT cluster across booths: a 35yo "Kumar" in one booth and
// another in a different booth are almost always different people.
//
// Response: { groups: [{ key, members: [{ id, epic, name, age, gender, ... }] }] }
router.get("/admin/voters/duplicates", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
    // Step 1: find duplicate keys.
    const groupRows = await db.execute<{
      name_key: string;
      age: number | null;
      polling_station_id: number | null;
      cnt: number;
    }>(sql`
      SELECT lower(full_name) AS name_key, age, polling_station_id, count(*)::int AS cnt
      FROM voters
      WHERE full_name IS NOT NULL AND length(full_name) > 1
      GROUP BY lower(full_name), age, polling_station_id
      HAVING count(*) > 1
      ORDER BY count(*) DESC, lower(full_name) ASC
      LIMIT ${limit}
    `);
    const rows = (groupRows as unknown as { rows: Array<{ name_key: string; age: number | null; polling_station_id: number | null; cnt: number }> }).rows;
    if (rows.length === 0) {
      res.json({ groups: [], total: 0 });
      return;
    }
    // Step 2: pull all members of every detected group in one query.
    const conds = rows.map((g) => and(
      sql`lower(${votersTable.fullName}) = ${g.name_key}`,
      g.age == null ? sql`${votersTable.age} IS NULL` : eq(votersTable.age, g.age),
      g.polling_station_id == null
        ? sql`${votersTable.pollingStationId} IS NULL`
        : eq(votersTable.pollingStationId, g.polling_station_id),
    ));
    const members = await db
      .select({
        id: votersTable.id,
        epicNumber: votersTable.epicNumber,
        fullName: votersTable.fullName,
        fullNameTa: votersTable.fullNameTa,
        age: votersTable.age,
        gender: votersTable.gender,
        relationName: votersTable.relationName,
        houseNumber: votersTable.houseNumber,
        addressLine: votersTable.addressLine,
        pollingStationId: votersTable.pollingStationId,
        phone: votersTable.phone,
        createdAt: votersTable.createdAt,
      })
      .from(votersTable)
      .where(or(...conds)!)
      .orderBy(asc(votersTable.fullName), asc(votersTable.id));
    // Step 3: regroup in JS so the UI can render side-by-side.
    const byKey = new Map<string, typeof members>();
    for (const m of members) {
      const key = `${(m.fullName ?? "").toLowerCase()}|${m.age ?? ""}|${m.pollingStationId ?? ""}`;
      const arr = byKey.get(key);
      if (arr) arr.push(m); else byKey.set(key, [m]);
    }
    const groups = rows.map((g) => {
      const key = `${g.name_key}|${g.age ?? ""}|${g.polling_station_id ?? ""}`;
      const ms = (byKey.get(key) ?? []).map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }));
      return {
        key,
        nameKey: g.name_key,
        age: g.age,
        pollingStationId: g.polling_station_id,
        count: g.cnt,
        members: ms,
      };
    }).filter((g) => g.members.length > 1);
    await logAudit(req, "VOTER_DUPLICATES_READ", "voters", `groups=${groups.length}`);
    res.json({ groups, total: groups.length });
  } catch (err) {
    console.error("[voters_advanced] duplicates:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/voters/merge
//
// body: { primaryId: number, duplicateIds: number[] }
//
// Reassigns every FK reference (tag assignments, notes, grievances,
// contact_log, relations) from each duplicate → primary, then deletes
// the duplicate voter rows. All in a single transaction.
//
// Tag assignments: if a duplicate already shares a tag with the primary
// the duplicate's row is dropped (PK conflict avoided). Relations:
// self-referential edges (primary↔primary) created by reassignment
// are deleted to keep the graph clean.
const mergeBodySchema = z.object({
  primaryId: z.number().int().positive(),
  duplicateIds: z.array(z.number().int().positive()).min(1).max(10),
}).strict();

router.post("/admin/voters/merge", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const parsed = mergeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() });
      return;
    }
    const { primaryId, duplicateIds } = parsed.data;
    if (duplicateIds.includes(primaryId)) {
      res.status(400).json({ error: "primaryId cannot appear in duplicateIds" });
      return;
    }
    const allIds = [primaryId, ...duplicateIds];
    const present = await db
      .select({ id: votersTable.id, epicNumber: votersTable.epicNumber })
      .from(votersTable)
      .where(inArray(votersTable.id, allIds));
    if (present.length !== allIds.length) {
      res.status(404).json({ error: "One or more voter ids not found" });
      return;
    }
    const primaryEpic = present.find((p) => p.id === primaryId)!.epicNumber;
    const dupEpics = present.filter((p) => p.id !== primaryId).map((p) => p.epicNumber);

    await db.transaction(async (tx) => {
      // Tag assignments — drop dup rows that would PK-conflict, then
      // reassign the rest.
      const primaryTags = await tx
        .select({ tagId: voterTagAssignmentsTable.tagId })
        .from(voterTagAssignmentsTable)
        .where(eq(voterTagAssignmentsTable.voterId, primaryId));
      const primaryTagIds = new Set(primaryTags.map((r) => r.tagId));
      if (primaryTagIds.size > 0) {
        await tx
          .delete(voterTagAssignmentsTable)
          .where(and(
            inArray(voterTagAssignmentsTable.voterId, duplicateIds),
            inArray(voterTagAssignmentsTable.tagId, [...primaryTagIds]),
          ));
      }
      await tx
        .update(voterTagAssignmentsTable)
        .set({ voterId: primaryId })
        .where(inArray(voterTagAssignmentsTable.voterId, duplicateIds));

      // Notes, grievances, contact_log: simple FK rewrite.
      await tx
        .update(voterNotesTable)
        .set({ voterId: primaryId })
        .where(inArray(voterNotesTable.voterId, duplicateIds));
      await tx
        .update(grievancesTable)
        .set({ voterId: primaryId })
        .where(inArray(grievancesTable.voterId, duplicateIds));
      await tx
        .update(voterContactLogTable)
        .set({ voterId: primaryId })
        .where(inArray(voterContactLogTable.voterId, duplicateIds));

      // Relations: pre-delete any duplicate rows that would collide
      // with the unique (voter_id, related_voter_id) constraint AFTER
      // the rewrite, then rewrite both sides, then drop self-refs.
      // Without the pre-delete, e.g. {dup→X} colliding with primary's
      // existing {primary→X} would 500 on UPDATE.
      await tx.execute(sql`
        DELETE FROM voter_relations
        WHERE voter_id = ANY(${duplicateIds})
          AND EXISTS (
            SELECT 1 FROM voter_relations p
            WHERE p.voter_id = ${primaryId}
              AND p.related_voter_id = voter_relations.related_voter_id
          )
      `);
      await tx.execute(sql`
        DELETE FROM voter_relations
        WHERE related_voter_id = ANY(${duplicateIds})
          AND EXISTS (
            SELECT 1 FROM voter_relations p
            WHERE p.related_voter_id = ${primaryId}
              AND p.voter_id = voter_relations.voter_id
          )
      `);
      // Also pre-delete cross-edges that would become self-refs after
      // rewrite (dup→primary, primary→dup, dup→dup).
      await tx.execute(sql`
        DELETE FROM voter_relations
        WHERE (voter_id = ${primaryId} AND related_voter_id = ANY(${duplicateIds}))
           OR (related_voter_id = ${primaryId} AND voter_id = ANY(${duplicateIds}))
           OR (voter_id = ANY(${duplicateIds}) AND related_voter_id = ANY(${duplicateIds}))
      `);
      await tx
        .update(voterRelationsTable)
        .set({ voterId: primaryId })
        .where(inArray(voterRelationsTable.voterId, duplicateIds));
      await tx
        .update(voterRelationsTable)
        .set({ relatedVoterId: primaryId })
        .where(inArray(voterRelationsTable.relatedVoterId, duplicateIds));

      // Finally delete the duplicate voter rows.
      await tx.delete(votersTable).where(inArray(votersTable.id, duplicateIds));
    });

    await logAudit(
      req, "VOTER_MERGE", `voter:${primaryEpic}`,
      `primary_id=${primaryId} merged_epics=${dupEpics.join(",")}`,
    );
    res.json({ ok: true, primaryId, mergedCount: duplicateIds.length });
  } catch (err) {
    console.error("[voters_advanced] merge:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T107 — Bulk attribute operations
// =============================================================

// POST /api/admin/voters/bulk
//
// body:
//   { action: "tag-add"|"tag-remove", tagId: number,
//     voterIds?: number[], filter?: <VoterFilter>, confirmCount?: number }
//   { action: "reassign-booth", newPollingStationId: number,
//     voterIds?: number[], filter?: <VoterFilter>, confirmCount?: number }
//
// Same confirmCount safety as bulk-delete — required when using filter
// mode. Hard ceiling 100k. Audits one summary row.
// Note: we use a plain z.union (not z.discriminatedUnion) because the
// target shape is overlaid via z.union of voterIds vs filter — Zod's
// discriminator inference can't see across that intersection. The
// runtime behaviour is identical; only the error message style changes.
const bulkOpSchema = z.union([
  z.object({
    action: z.literal("tag-add"),
    tagId: z.number().int().positive(),
    voterIds: z.array(z.number().int().positive()).min(1).max(5000).optional(),
    filter: voterFilterSchema.optional(),
    confirmCount: z.number().int().min(0).max(1_000_000).optional(),
  }),
  z.object({
    action: z.literal("tag-remove"),
    tagId: z.number().int().positive(),
    voterIds: z.array(z.number().int().positive()).min(1).max(5000).optional(),
    filter: voterFilterSchema.optional(),
    confirmCount: z.number().int().min(0).max(1_000_000).optional(),
  }),
  z.object({
    action: z.literal("reassign-booth"),
    newPollingStationId: z.number().int().positive(),
    voterIds: z.array(z.number().int().positive()).min(1).max(5000).optional(),
    filter: voterFilterSchema.optional(),
    confirmCount: z.number().int().min(0).max(1_000_000).optional(),
  }),
]).refine(
  (v) => (v.voterIds && v.voterIds.length > 0) || (v.filter && v.confirmCount != null),
  { message: "Either voterIds or (filter + confirmCount) is required" },
);

router.post("/admin/voters/bulk", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const parsed = bulkOpSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    let targetIds: number[];
    if (data.voterIds && data.voterIds.length > 0) {
      targetIds = Array.from(new Set(data.voterIds));
    } else {
      const filter = data.filter ?? {};
      const confirmCount = data.confirmCount ?? -1;
      const conds = await buildVoterFilterConds(filter);
      if (conds === null) { res.json({ ok: true, affectedCount: 0 }); return; }
      const where = conds.length > 0 ? and(...conds) : undefined;
      const [{ n: actualCount }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(votersTable).where(where);
      if (actualCount !== confirmCount) {
        res.status(409).json({ error: "Confirm count mismatch", actualCount, confirmCount });
        return;
      }
      const HARD_CEIL = 100_000;
      if (actualCount > HARD_CEIL) {
        res.status(413).json({ error: `Refusing >${HARD_CEIL} in one call`, actualCount });
        return;
      }
      const rows = await db.select({ id: votersTable.id }).from(votersTable).where(where);
      targetIds = rows.map((r) => r.id);
    }
    if (targetIds.length === 0) { res.json({ ok: true, affectedCount: 0 }); return; }

    let affectedCount = 0;
    if (data.action === "tag-add") {
      // Validate tag exists.
      const [t] = await db.select({ id: voterTagsTable.id }).from(voterTagsTable).where(eq(voterTagsTable.id, data.tagId)).limit(1);
      if (!t) { res.status(400).json({ error: "Unknown tag id" }); return; }
      // Insert with ON CONFLICT DO NOTHING (PK is composite voter_id+tag_id).
      const chunkSize = 1000;
      for (let off = 0; off < targetIds.length; off += chunkSize) {
        const chunk = targetIds.slice(off, off + chunkSize);
        const inserted = await db.insert(voterTagAssignmentsTable).values(
          chunk.map((vid) => ({
            voterId: vid, tagId: data.tagId,
            assignedBy: req.user?.id ?? null,
            assignedByName: req.user?.name ?? "Unknown",
          })),
        ).onConflictDoNothing().returning({ vid: voterTagAssignmentsTable.voterId });
        affectedCount += inserted.length;
      }
      await logAudit(req, "VOTER_BULK_TAG_ADD", `voter_tag:${data.tagId}`, `voter_count=${targetIds.length} added=${affectedCount}`);
    } else if (data.action === "tag-remove") {
      const result = await db.delete(voterTagAssignmentsTable)
        .where(and(eq(voterTagAssignmentsTable.tagId, data.tagId), inArray(voterTagAssignmentsTable.voterId, targetIds)))
        .returning({ vid: voterTagAssignmentsTable.voterId });
      affectedCount = result.length;
      await logAudit(req, "VOTER_BULK_TAG_REMOVE", `voter_tag:${data.tagId}`, `voter_count=${targetIds.length} removed=${affectedCount}`);
    } else { // reassign-booth
      const [b] = await db.select({ id: pollingStationsTable.id }).from(pollingStationsTable).where(eq(pollingStationsTable.id, data.newPollingStationId)).limit(1);
      if (!b) { res.status(400).json({ error: "Unknown polling station" }); return; }
      const result = await db.update(votersTable)
        .set({ pollingStationId: data.newPollingStationId })
        .where(inArray(votersTable.id, targetIds))
        .returning({ id: votersTable.id });
      affectedCount = result.length;
      await logAudit(req, "VOTER_BULK_REASSIGN_BOOTH", `polling_station:${data.newPollingStationId}`, `voter_count=${affectedCount}`);
    }
    res.json({ ok: true, affectedCount });
  } catch (err) {
    console.error("[voters_advanced] bulk:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T202 — Voter contact log
// =============================================================

// All endpoints require super_admin (consistent with other voter PII
// flows in voters.ts). When we relax that policy in future to allow
// booth coordinators to log their own visits, swap requireVoterScope
// for requireStaff + a per-voter scope check (loadVoterForUser).

const contactLogCreateSchema = z.object({
  contactType: z.enum(VOTER_CONTACT_TYPES),
  direction: z.enum(VOTER_CONTACT_DIRECTIONS).optional().default("out"),
  outcome: z.enum(VOTER_CONTACT_OUTCOMES).nullable().optional(),
  summary: z.string().trim().min(1).max(1000),
  contactedAt: z.string().datetime().optional(), // ISO; defaults to now
}).strict();

router.get("/admin/voters/:id/contact-log", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const rows = await db.select().from(voterContactLogTable)
      .where(eq(voterContactLogTable.voterId, id))
      .orderBy(desc(voterContactLogTable.contactedAt))
      .limit(200);
    res.json({ items: rows.map((r) => ({
      ...r,
      contactedAt: r.contactedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })) });
  } catch (err) {
    console.error("[voters_advanced] contact-log get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/voters/:id/contact-log", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = contactLogCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() }); return;
    }
    const [voter] = await db.select({ id: votersTable.id, epicNumber: votersTable.epicNumber })
      .from(votersTable).where(eq(votersTable.id, id)).limit(1);
    if (!voter) { res.status(404).json({ error: "Voter not found" }); return; }
    const [row] = await db.insert(voterContactLogTable).values({
      voterId: id,
      contactType: parsed.data.contactType,
      direction: parsed.data.direction ?? "out",
      outcome: parsed.data.outcome ?? null,
      summary: parsed.data.summary,
      contactedAt: parsed.data.contactedAt ? new Date(parsed.data.contactedAt) : new Date(),
      contactedBy: req.user?.id ?? null,
      contactedByName: req.user?.name ?? "Unknown",
    }).returning();
    await logAudit(req, "VOTER_CONTACT_LOG_CREATE", `voter:${voter.epicNumber}`, `id=${row.id} type=${row.contactType} outcome=${row.outcome ?? ""}`);
    res.status(201).json({
      ...row,
      contactedAt: row.contactedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("[voters_advanced] contact-log post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/voters/:id/contact-log/:lid", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    const lid = Number.parseInt(String(req.params.lid), 10);
    if (!Number.isFinite(id) || !Number.isFinite(lid)) { res.status(400).json({ error: "Invalid id" }); return; }
    const result = await db.delete(voterContactLogTable)
      .where(and(eq(voterContactLogTable.id, lid), eq(voterContactLogTable.voterId, id)))
      .returning({ id: voterContactLogTable.id });
    if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "VOTER_CONTACT_LOG_DELETE", `voter:${id}`, `log_id=${lid}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[voters_advanced] contact-log delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T203 — Voter relations (family graph)
// =============================================================

// kind on voter→relatedVoter; we store the inverse on the reverse edge.
const INVERSE_KIND: Record<string, string> = {
  spouse: "spouse",
  parent: "child",
  child: "parent",
  sibling: "sibling",
  in_law: "in_law",
  other: "other",
};

const relationCreateSchema = z.object({
  relatedVoterId: z.number().int().positive(),
  kind: z.enum(VOTER_RELATION_KINDS),
  notes: z.string().trim().max(500).nullable().optional(),
}).strict();

router.get("/admin/voters/:id/relations", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const rows = await db
      .select({
        id: voterRelationsTable.id,
        kind: voterRelationsTable.kind,
        notes: voterRelationsTable.notes,
        createdAt: voterRelationsTable.createdAt,
        createdByName: voterRelationsTable.createdByName,
        relatedVoterId: voterRelationsTable.relatedVoterId,
        relatedEpic: votersTable.epicNumber,
        relatedName: votersTable.fullName,
        relatedNameTa: votersTable.fullNameTa,
        relatedAge: votersTable.age,
        relatedGender: votersTable.gender,
      })
      .from(voterRelationsTable)
      .innerJoin(votersTable, eq(votersTable.id, voterRelationsTable.relatedVoterId))
      .where(eq(voterRelationsTable.voterId, id))
      .orderBy(asc(voterRelationsTable.kind), asc(votersTable.fullName));
    res.json({ items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
  } catch (err) {
    console.error("[voters_advanced] relations get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/voters/:id/relations", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = relationCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() }); return;
    }
    if (parsed.data.relatedVoterId === id) {
      res.status(400).json({ error: "Voter cannot be related to themselves" }); return;
    }
    const found = await db.select({ id: votersTable.id, epicNumber: votersTable.epicNumber })
      .from(votersTable)
      .where(inArray(votersTable.id, [id, parsed.data.relatedVoterId]));
    if (found.length !== 2) { res.status(404).json({ error: "One or both voters not found" }); return; }
    const me = found.find((f) => f.id === id)!;

    const inverseKind = INVERSE_KIND[parsed.data.kind] ?? "other";
    const actorId = req.user?.id ?? null;
    const actorName = req.user?.name ?? "Unknown";
    await db.transaction(async (tx) => {
      await tx.insert(voterRelationsTable).values([
        {
          voterId: id, relatedVoterId: parsed.data.relatedVoterId,
          kind: parsed.data.kind, notes: parsed.data.notes ?? null,
          createdBy: actorId, createdByName: actorName,
        },
        {
          voterId: parsed.data.relatedVoterId, relatedVoterId: id,
          kind: inverseKind, notes: parsed.data.notes ?? null,
          createdBy: actorId, createdByName: actorName,
        },
      ]).onConflictDoNothing();
    });
    await logAudit(req, "VOTER_RELATION_CREATE", `voter:${me.epicNumber}`, `to_voter_id=${parsed.data.relatedVoterId} kind=${parsed.data.kind}`);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[voters_advanced] relations post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/voters/:id/relations/:rid", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    const rid = Number.parseInt(String(req.params.rid), 10);
    if (!Number.isFinite(id) || !Number.isFinite(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
    // Look up the row so we know the related voter (to delete the inverse too).
    const [row] = await db.select().from(voterRelationsTable)
      .where(and(eq(voterRelationsTable.id, rid), eq(voterRelationsTable.voterId, id)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    await db.transaction(async (tx) => {
      await tx.delete(voterRelationsTable).where(eq(voterRelationsTable.id, rid));
      // Inverse — match (relatedVoterId, voterId) pair.
      await tx.delete(voterRelationsTable).where(and(
        eq(voterRelationsTable.voterId, row.relatedVoterId),
        eq(voterRelationsTable.relatedVoterId, row.voterId),
      ));
    });
    await logAudit(req, "VOTER_RELATION_DELETE", `voter:${id}`, `relation_id=${rid}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[voters_advanced] relations delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T204 — Per-voter timeline (aggregator)
// =============================================================

// Merges contact_log + notes + grievances + tag-assignments for one
// voter, sorted desc by event time. Used by the timeline tab in the
// detail sheet. No DB writes here, just reads — but still gated to
// super_admin since it returns PII.
router.get("/admin/voters/:id/timeline", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [contact, notes, gr, tags] = await Promise.all([
      db.select({
        id: voterContactLogTable.id,
        contactType: voterContactLogTable.contactType,
        direction: voterContactLogTable.direction,
        outcome: voterContactLogTable.outcome,
        summary: voterContactLogTable.summary,
        contactedAt: voterContactLogTable.contactedAt,
        contactedByName: voterContactLogTable.contactedByName,
      }).from(voterContactLogTable).where(eq(voterContactLogTable.voterId, id))
        .orderBy(desc(voterContactLogTable.contactedAt)).limit(100),
      db.select({
        id: voterNotesTable.id, body: voterNotesTable.body,
        authorName: voterNotesTable.authorName, createdAt: voterNotesTable.createdAt,
      }).from(voterNotesTable).where(eq(voterNotesTable.voterId, id))
        .orderBy(desc(voterNotesTable.createdAt)).limit(100),
      db.select({
        id: grievancesTable.id, ticketNo: grievancesTable.ticketNo,
        category: grievancesTable.category, status: grievancesTable.status,
        description: grievancesTable.description, createdAt: grievancesTable.createdAt,
      }).from(grievancesTable).where(eq(grievancesTable.voterId, id))
        .orderBy(desc(grievancesTable.createdAt)).limit(50),
      db.select({
        id: voterTagsTable.id, name: voterTagsTable.name, color: voterTagsTable.color,
        assignedAt: voterTagAssignmentsTable.assignedAt,
        assignedByName: voterTagAssignmentsTable.assignedByName,
      }).from(voterTagAssignmentsTable)
        .innerJoin(voterTagsTable, eq(voterTagsTable.id, voterTagAssignmentsTable.tagId))
        .where(eq(voterTagAssignmentsTable.voterId, id))
        .orderBy(desc(voterTagAssignmentsTable.assignedAt)).limit(50),
    ]);
    type Item = { kind: string; at: string; data: Record<string, unknown> };
    const items: Item[] = [
      ...contact.map((c) => ({
        kind: "contact" as const,
        at: c.contactedAt.toISOString(),
        data: { ...c, contactedAt: c.contactedAt.toISOString() },
      })),
      ...notes.map((n) => ({
        kind: "note" as const,
        at: n.createdAt.toISOString(),
        data: { ...n, createdAt: n.createdAt.toISOString() },
      })),
      ...gr.map((g) => ({
        kind: "grievance" as const,
        at: g.createdAt.toISOString(),
        data: { ...g, createdAt: g.createdAt.toISOString() },
      })),
      ...tags.map((t) => ({
        kind: "tag" as const,
        at: t.assignedAt.toISOString(),
        data: { ...t, assignedAt: t.assignedAt.toISOString() },
      })),
    ];
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    res.json({ items });
  } catch (err) {
    console.error("[voters_advanced] timeline:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T301 — Voter segments (saved filters)
// =============================================================

const segmentCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  filterJson: z.record(z.string(), z.unknown()),
  sharedWithRole: z.string().trim().max(40).nullable().optional(),
  pinned: z.boolean().optional(),
}).strict();

const segmentUpdateSchema = segmentCreateSchema.partial();

router.get("/admin/voter-segments", requireStaff, async (req: AuthRequest, res) => {
  try {
    const role = req.user?.role ?? "";
    const rows = await db.select().from(voterSegmentsTable).orderBy(
      desc(voterSegmentsTable.pinned), asc(voterSegmentsTable.name),
    );
    // Visibility: own + shared("*") + shared(myRole). super_admin sees all.
    const items = rows.filter((r) => {
      if (role === "super_admin") return true;
      if (r.ownerUserId === (req.user?.id ?? -1)) return true;
      if (r.sharedWithRole === "*") return true;
      if (r.sharedWithRole && r.sharedWithRole === role) return true;
      return false;
    });
    res.json({ items: items.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      lastCountAt: r.lastCountAt?.toISOString() ?? null,
    })) });
  } catch (err) {
    console.error("[voters_advanced] segments get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/voter-segments", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const parsed = segmentCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() }); return;
    }
    const [row] = await db.insert(voterSegmentsTable).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      filterJson: parsed.data.filterJson,
      ownerUserId: req.user?.id ?? null,
      ownerName: req.user?.name ?? "Unknown",
      sharedWithRole: parsed.data.sharedWithRole ?? null,
      pinned: parsed.data.pinned ?? false,
    }).returning();
    await logAudit(req, "VOTER_SEGMENT_CREATE", `voter_segment:${row.id}`, row.name);
    res.status(201).json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastCountAt: null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (/unique/i.test(msg)) { res.status(409).json({ error: "Segment name already taken" }); return; }
    console.error("[voters_advanced] segments post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/voter-segments/:id", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = segmentUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() }); return;
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.name != null) patch.name = parsed.data.name;
    if ("description" in parsed.data) patch.description = parsed.data.description ?? null;
    if (parsed.data.filterJson != null) patch.filterJson = parsed.data.filterJson;
    if ("sharedWithRole" in parsed.data) patch.sharedWithRole = parsed.data.sharedWithRole ?? null;
    if (parsed.data.pinned != null) patch.pinned = parsed.data.pinned;
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Empty patch" }); return; }
    const [row] = await db.update(voterSegmentsTable).set(patch).where(eq(voterSegmentsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "VOTER_SEGMENT_UPDATE", `voter_segment:${id}`, JSON.stringify(patch).slice(0, 400));
    res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastCountAt: row.lastCountAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[voters_advanced] segments patch:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/voter-segments/:id", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [row] = await db.delete(voterSegmentsTable).where(eq(voterSegmentsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "VOTER_SEGMENT_DELETE", `voter_segment:${id}`, row.name);
    res.json({ ok: true });
  } catch (err) {
    console.error("[voters_advanced] segments delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/voter-segments/:id/refresh-count — recompute lastCount
// from the segment's filterJson and persist it. Cheap (single COUNT).
router.post("/admin/voter-segments/:id/refresh-count", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [seg] = await db.select().from(voterSegmentsTable).where(eq(voterSegmentsTable.id, id)).limit(1);
    if (!seg) { res.status(404).json({ error: "Not found" }); return; }
    const filterParsed = voterFilterSchema.safeParse(seg.filterJson ?? {});
    if (!filterParsed.success) { res.status(400).json({ error: "Segment has invalid filter" }); return; }
    const conds = await buildVoterFilterConds(filterParsed.data);
    let count = 0;
    if (conds !== null) {
      const where = conds.length > 0 ? and(...conds) : undefined;
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(votersTable).where(where);
      count = n;
    }
    const now = new Date();
    await db.update(voterSegmentsTable).set({ lastCount: count, lastCountAt: now }).where(eq(voterSegmentsTable.id, id));
    res.json({ count, lastCountAt: now.toISOString() });
  } catch (err) {
    console.error("[voters_advanced] segments refresh-count:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T302 — Analytics
// =============================================================

// GET /api/admin/voters/analytics
//
// Returns aggregate stats for the dashboard:
//   - total voters
//   - by gender
//   - by 10-year age band
//   - by booth (top 20 by count)
//   - tag distribution
//   - phone coverage (count + %)
//   - whatsapp opt-in count
//   - grievance density (linked grievances per booth)
//
// All counts are aggregate so the response carries no PII.
router.get("/admin/voters/analytics", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const wardIdRaw = req.query.wardId;
    let boothFilter: number[] | null = null;
    if (wardIdRaw && typeof wardIdRaw === "string" && /^\d+$/.test(wardIdRaw)) {
      const wardId = Number.parseInt(wardIdRaw, 10);
      const wardBooths = await db.select({ id: pollingStationsTable.id })
        .from(pollingStationsTable).where(eq(pollingStationsTable.wardId, wardId));
      boothFilter = wardBooths.map((b) => b.id);
      if (boothFilter.length === 0) {
        res.json({
          totalVoters: 0, byGender: [], byAgeBand: [], byBooth: [],
          byTag: [], phoneCoverage: { withPhone: 0, total: 0, percent: 0 },
          whatsappOptIn: 0, grievancesByBooth: [],
        });
        return;
      }
    }
    const baseWhere = boothFilter ? inArray(votersTable.pollingStationId, boothFilter) : undefined;

    const [
      totalRow,
      genderRows,
      ageBandRowsRaw,
      boothRowsRaw,
      tagRowsRaw,
      phoneRow,
      whatsappRow,
      grievanceBoothRowsRaw,
    ] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(votersTable).where(baseWhere),
      db.select({ gender: votersTable.gender, n: sql<number>`count(*)::int` })
        .from(votersTable).where(baseWhere)
        .groupBy(votersTable.gender),
      db.execute(sql`
        SELECT
          CASE
            WHEN age IS NULL THEN 'unknown'
            WHEN age < 18 THEN '<18'
            WHEN age < 30 THEN '18-29'
            WHEN age < 45 THEN '30-44'
            WHEN age < 60 THEN '45-59'
            ELSE '60+'
          END AS band,
          count(*)::int AS n
        FROM voters
        ${boothFilter ? sql`WHERE polling_station_id = ANY(${boothFilter})` : sql``}
        GROUP BY band
        ORDER BY band
      `),
      db.execute(sql`
        SELECT v.polling_station_id, ps.booth_no, ps.name, count(*)::int AS n
        FROM voters v
        LEFT JOIN polling_stations ps ON ps.id = v.polling_station_id
        ${boothFilter ? sql`WHERE v.polling_station_id = ANY(${boothFilter})` : sql``}
        GROUP BY v.polling_station_id, ps.booth_no, ps.name
        ORDER BY n DESC
        LIMIT 20
      `),
      db.execute(sql`
        SELECT t.id, t.name, t.color, count(*)::int AS n
        FROM voter_tag_assignments a
        INNER JOIN voter_tags t ON t.id = a.tag_id
        ${boothFilter ? sql`INNER JOIN voters v ON v.id = a.voter_id WHERE v.polling_station_id = ANY(${boothFilter})` : sql``}
        GROUP BY t.id, t.name, t.color
        ORDER BY n DESC
      `),
      db.select({
        withPhone: sql<number>`count(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int`,
        total: sql<number>`count(*)::int`,
      }).from(votersTable).where(baseWhere),
      db.select({ n: sql<number>`count(*) FILTER (WHERE whatsapp_opt_in = TRUE)::int` })
        .from(votersTable).where(baseWhere),
      db.execute(sql`
        SELECT g.polling_station_id, ps.booth_no, count(*)::int AS n
        FROM grievances g
        LEFT JOIN polling_stations ps ON ps.id = g.polling_station_id
        WHERE g.voter_id IS NOT NULL
        ${boothFilter ? sql`AND g.polling_station_id = ANY(${boothFilter})` : sql``}
        GROUP BY g.polling_station_id, ps.booth_no
        ORDER BY n DESC
        LIMIT 20
      `),
    ]);

    const totalVoters = totalRow[0]?.n ?? 0;
    const phoneCoverage = {
      withPhone: phoneRow[0]?.withPhone ?? 0,
      total: phoneRow[0]?.total ?? 0,
      percent: phoneRow[0]?.total ? Math.round((100 * (phoneRow[0]?.withPhone ?? 0)) / phoneRow[0].total) : 0,
    };
    res.json({
      totalVoters,
      byGender: genderRows.map((r) => ({ gender: r.gender ?? "unknown", n: r.n })),
      byAgeBand: (ageBandRowsRaw as unknown as { rows: Array<{ band: string; n: number }> }).rows,
      byBooth: (boothRowsRaw as unknown as { rows: Array<{ polling_station_id: number | null; booth_no: string | null; name: string | null; n: number }> }).rows,
      byTag: (tagRowsRaw as unknown as { rows: Array<{ id: number; name: string; color: string; n: number }> }).rows,
      phoneCoverage,
      whatsappOptIn: whatsappRow[0]?.n ?? 0,
      grievancesByBooth: (grievanceBoothRowsRaw as unknown as { rows: Array<{ polling_station_id: number | null; booth_no: string | null; n: number }> }).rows,
    });
  } catch (err) {
    console.error("[voters_advanced] analytics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================
// T303 — Callsheet (server-side data; UI prints it)
// =============================================================

// POST /api/admin/voters/callsheet
//
// body: { filter?: <VoterFilter>, voterIds?: number[], groupBy?: "booth"|"none" }
//
// Returns up to 5,000 voter rows grouped (default by booth) so the UI
// can render a print-friendly page and hit window.print() for a PDF
// without needing a server-side PDF library.
const callsheetSchema = z.object({
  filter: voterFilterSchema.optional(),
  voterIds: z.array(z.number().int().positive()).max(5000).optional(),
  groupBy: z.enum(["booth", "none"]).optional().default("booth"),
}).strict().refine((v) => v.filter || v.voterIds, { message: "Either filter or voterIds required" });

router.post("/admin/voters/callsheet", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const parsed = callsheetSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid", details: parsed.error.flatten() }); return;
    }
    let where;
    if (parsed.data.voterIds) {
      where = inArray(votersTable.id, parsed.data.voterIds);
    } else {
      const conds = await buildVoterFilterConds(parsed.data.filter!);
      if (conds === null) { res.json({ groups: [], total: 0 }); return; }
      where = conds.length > 0 ? and(...conds) : undefined;
    }
    const rows = await db.select({
      id: votersTable.id,
      epicNumber: votersTable.epicNumber,
      fullName: votersTable.fullName,
      fullNameTa: votersTable.fullNameTa,
      age: votersTable.age,
      gender: votersTable.gender,
      relationName: votersTable.relationName,
      houseNumber: votersTable.houseNumber,
      addressLine: votersTable.addressLine,
      partNumber: votersTable.partNumber,
      serialInPart: votersTable.serialInPart,
      phone: votersTable.phone,
      whatsappOptIn: votersTable.whatsappOptIn,
      pollingStationId: votersTable.pollingStationId,
      boothNo: pollingStationsTable.boothNo,
      boothName: pollingStationsTable.name,
    })
      .from(votersTable)
      .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, votersTable.pollingStationId))
      .where(where)
      .orderBy(asc(pollingStationsTable.boothNo), asc(votersTable.serialInPart), asc(votersTable.fullName))
      .limit(5000);
    if (parsed.data.groupBy === "none") {
      res.json({ groups: [{ key: "all", label: "All", members: rows }], total: rows.length });
      return;
    }
    // Group by booth.
    const byBooth = new Map<string, typeof rows>();
    const labelByKey = new Map<string, string>();
    for (const r of rows) {
      const key = String(r.pollingStationId ?? "none");
      const label = r.pollingStationId
        ? `Booth ${r.boothNo ?? "?"} — ${r.boothName ?? ""}`
        : "(no booth)";
      labelByKey.set(key, label);
      const arr = byBooth.get(key);
      if (arr) arr.push(r); else byBooth.set(key, [r]);
    }
    const groups = [...byBooth.entries()].map(([key, members]) => ({
      key,
      label: labelByKey.get(key) ?? key,
      members,
    }));
    await logAudit(req, "VOTER_CALLSHEET_READ", "voters", `count=${rows.length} groups=${groups.length}`);
    res.json({ groups, total: rows.length });
  } catch (err) {
    console.error("[voters_advanced] callsheet:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
