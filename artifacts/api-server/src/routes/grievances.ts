import { Router } from "express";
import { db } from "@workspace/db";
import {
  grievancesTable,
  grievanceAttachmentsTable,
  grievanceRemarksTable,
  grievanceStatusLogTable,
  grievanceRoutingLogTable,
  grievanceVoterLinkLogTable,
  votersTable,
  pollingStationsTable,
  wardsTable,
  auditLogTable,
  usersTable,
} from "@workspace/db/schema";
import { requireStaff, type AuthRequest } from "../lib/auth.js";
import { eq, desc, and, count, gte, lte, sql, inArray } from "drizzle-orm";
import {
  resolveOwnerForGrievance, logRouting, resolveWardId,
  validateAreaInWard, validateBoothInWard,
} from "../lib/grievance-routing.js";
import { getVoterScopeForUser, resolveScopeBoothIds } from "../lib/voterScope.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "grievances");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|mp4|mov|avi|webm|mkv|mp3|wav|ogg|m4a|aac/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

function generateTicketNo(): string {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 90000) + 10000);
  return `GRV-${year}-${rand}`;
}

function serializeGrievance(g: typeof grievancesTable.$inferSelect) {
  return {
    ...g,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    resolvedAt: g.resolvedAt?.toISOString() ?? null,
  };
}

const SubmitBody = z.object({
  name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email().optional().nullable(),
  category: z.string().min(1),
  description: z.string().min(10),
  address: z.string().optional().nullable(),
  ward: z.string().optional().nullable(),
  constituency: z.string().optional().nullable(),
  anonymous: z.boolean().optional(),
  // optional sub-ward routing scope (cascading dropdowns)
  areaId: z.coerce.number().int().positive().optional().nullable(),
  pollingStationId: z.coerce.number().int().positive().optional().nullable(),
  // Optional citizen-supplied GPS coords (pin-drop or "use my location").
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  // Statewide / ministerial complaint support
  complaintScope: z.enum(["constituency", "statewide"]).optional().nullable(),
  district: z.string().optional().nullable(),
}).refine(
  (d) => (d.latitude == null) === (d.longitude == null),
  { message: "latitude and longitude must be supplied together", path: ["longitude"] },
);

const StatusUpdateBody = z.object({
  status: z.enum(["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"]),
  note: z.string().optional().nullable(),
});

const RemarkBody = z.object({
  remark: z.string().min(1),
  isPublic: z.boolean().optional(),
});

const AssignBody = z.object({
  officerId: z.number().int(),
  officerName: z.string().min(1),
  note: z.string().optional().nullable(),
});

// POST /api/grievances/submit — public
router.post("/grievances/submit", upload.array("attachments", 5), async (req, res) => {
  try {
    const body = SubmitBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    let ticketNo = generateTicketNo();
    const existing = await db.select({ id: grievancesTable.id }).from(grievancesTable)
      .where(eq(grievancesTable.ticketNo, ticketNo)).limit(1);
    if (existing.length > 0) ticketNo = generateTicketNo();

    // Reject tampered or inconsistent ward / area / booth combinations
    // up-front so a citizen can't trick the auto-router into picking an
    // officer outside the actual booth's ward.
    const wardIdForCheck = await resolveWardId({
      wardName: body.data.ward ?? null,
      areaId: body.data.areaId ?? null,
      pollingStationId: body.data.pollingStationId ?? null,
    });
    if (wardIdForCheck) {
      const [areaOk, boothOk] = await Promise.all([
        validateAreaInWard(body.data.areaId, wardIdForCheck),
        validateBoothInWard(body.data.pollingStationId, wardIdForCheck),
      ]);
      if (!areaOk) {
        res.status(400).json({ error: "Selected area does not belong to the chosen ward" });
        return;
      }
      if (!boothOk) {
        res.status(400).json({ error: "Selected polling booth does not belong to the chosen ward" });
        return;
      }
    }

    // Resolve auto-routed officer BEFORE insert so we can persist
    // assignedTo + scope in one row. Falls back to null (shared inbox)
    // if no rule matches.
    const routing = await resolveOwnerForGrievance({
      wardName: body.data.ward ?? null,
      areaId: body.data.areaId ?? null,
      pollingStationId: body.data.pollingStationId ?? null,
    });

    const [grievance] = await db.insert(grievancesTable).values({
      ticketNo,
      name: body.data.name,
      phone: body.data.phone,
      email: body.data.email ?? null,
      category: body.data.category,
      description: body.data.description,
      address: body.data.address ?? null,
      ward: body.data.ward ?? null,
      areaId: body.data.areaId ?? null,
      pollingStationId: body.data.pollingStationId ?? null,
      latitude: body.data.latitude ?? null,
      longitude: body.data.longitude ?? null,
      constituency: body.data.constituency ?? "Tirupparankundram",
      complaintScope: body.data.complaintScope ?? "constituency",
      district: body.data.district ?? null,
      anonymous: body.data.anonymous ?? false,
      priority: "Medium",
      status: "Submitted",
      assignedTo: routing.officerId,
    }).returning();

    // Persist uploaded attachments
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      await db.insert(grievanceAttachmentsTable).values(
        files.map((f) => ({
          grievanceId: grievance.id,
          fileUrl: `/uploads/grievances/${f.filename}`,
          fileName: f.originalname,
          fileType: f.mimetype,
          fileSize: f.size,
        }))
      );
    }

    // Log initial status
    await db.insert(grievanceStatusLogTable).values({
      grievanceId: grievance.id,
      fromStatus: null,
      toStatus: "Submitted",
      changedByName: "System",
      note: "Grievance submitted by citizen",
    });

    // Audit-log the auto-routing decision (always — even when no rule matched).
    await logRouting({
      grievanceId: grievance.id,
      fromOfficerId: null,
      toOfficerId: routing.officerId,
      reason: "auto",
      matchedScope: routing.matchedScope,
      matchedScopeId: routing.matchedScopeId,
      changedBy: null,
      changedByName: "System",
      note: routing.officerId
        ? `Auto-routed at ${routing.matchedScope} scope (${routing.candidateCount} candidate${routing.candidateCount === 1 ? "" : "s"})`
        : "No assignment rule matched — falls back to shared inbox",
    });

    res.status(201).json(serializeGrievance(grievance));
  } catch (err) {
    console.error("[grievances] submit error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances/heatmap — public
router.get("/grievances/heatmap", async (_req, res) => {
  try {
    const byCategory = await db
      .select({ category: grievancesTable.category, count: count() })
      .from(grievancesTable)
      .groupBy(grievancesTable.category)
      .orderBy(desc(count()));

    const byWardRaw = await db
      .select({ ward: grievancesTable.ward, count: count() })
      .from(grievancesTable)
      .groupBy(grievancesTable.ward)
      .orderBy(desc(count()));

    const [totalResult] = await db.select({ count: count() }).from(grievancesTable);
    const [resolvedResult] = await db.select({ count: count() }).from(grievancesTable)
      .where(eq(grievancesTable.status, "Resolved"));

    res.json({
      byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
      byWard: byWardRaw.filter((r) => r.ward).map((r) => ({ ward: r.ward!, count: Number(r.count) })),
      total: Number(totalResult?.count ?? 0),
      resolved: Number(resolvedResult?.count ?? 0),
    });
  } catch (err) {
    console.error("[grievances] heatmap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances/track/:ticketNo — public (shows only public remarks)
router.get("/grievances/track/:ticketNo", async (req, res) => {
  try {
    const { ticketNo } = req.params;
    const [grievance] = await db.select().from(grievancesTable)
      .where(eq(grievancesTable.ticketNo, ticketNo)).limit(1);
    if (!grievance) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const remarks = await db.select().from(grievanceRemarksTable)
      .where(and(eq(grievanceRemarksTable.grievanceId, grievance.id), eq(grievanceRemarksTable.isPublic, true)))
      .orderBy(grievanceRemarksTable.createdAt);

    const statusLog = await db.select().from(grievanceStatusLogTable)
      .where(eq(grievanceStatusLogTable.grievanceId, grievance.id))
      .orderBy(grievanceStatusLogTable.createdAt);

    // Return a public-safe DTO — no PII (name/phone/email/address never exposed for non-anonymous)
    res.json({
      id: grievance.id,
      ticketNo: grievance.ticketNo,
      category: grievance.category,
      status: grievance.status,
      priority: grievance.priority,
      ward: grievance.ward,
      constituency: grievance.constituency,
      description: grievance.description,
      anonymous: grievance.anonymous,
      createdAt: grievance.createdAt.toISOString(),
      updatedAt: grievance.updatedAt.toISOString(),
      remarks: remarks.map((r) => ({
        id: r.id,
        grievanceId: r.grievanceId,
        remark: r.remark,
        isPublic: r.isPublic,
        authorName: r.authorName,
        createdAt: r.createdAt.toISOString(),
      })),
      statusLog: statusLog.map((l) => ({
        id: l.id,
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        changedByName: l.changedByName,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[grievances] track error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances — staff only (paginated list with filters)
router.get("/grievances", requireStaff, async (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.status) conditions.push(eq(grievancesTable.status, String(req.query.status)));
    if (req.query.category) conditions.push(eq(grievancesTable.category, String(req.query.category)));
    if (req.query.priority) conditions.push(eq(grievancesTable.priority, String(req.query.priority)));
    if (req.query.ward) conditions.push(eq(grievancesTable.ward, String(req.query.ward)));
    if (req.query.constituency) conditions.push(eq(grievancesTable.constituency, String(req.query.constituency)));
    if (req.query.complaintScope) conditions.push(eq(grievancesTable.complaintScope, String(req.query.complaintScope) as "constituency" | "statewide"));
    // Inbox scoping rules:
    //   * `mine=1`            → always restrict to caller's own assignments
    //   * caller is grievance_officer (no broader admin role) and neither
    //     `mine` nor `all=1` was passed → default to caller's own inbox
    //   * `all=1`             → explicit override, return everyone's
    //   * any other staff role and no flag → return everyone's (admin default)
    const mineFlag = String(req.query.mine ?? "") === "1";
    const allFlag = String(req.query.all ?? "") === "1";
    const callerRole = req.user?.role ?? "";
    const officerDefault = callerRole === "grievance_officer" && !mineFlag && !allFlag;
    if ((mineFlag || officerDefault) && req.user?.id) {
      conditions.push(eq(grievancesTable.assignedTo, req.user.id));
    }
    if (req.query.assignedTo) {
      const v = String(req.query.assignedTo);
      if (v === "unassigned") conditions.push(sql`${grievancesTable.assignedTo} IS NULL`);
      else {
        const id = parseInt(v, 10);
        if (Number.isFinite(id)) conditions.push(eq(grievancesTable.assignedTo, id));
      }
    }
    if (req.query.dateFrom) {
      const from = new Date(String(req.query.dateFrom));
      if (!isNaN(from.getTime())) conditions.push(gte(grievancesTable.createdAt, from));
    }
    if (req.query.dateTo) {
      const to = new Date(String(req.query.dateTo));
      if (!isNaN(to.getTime())) { to.setHours(23, 59, 59, 999); conditions.push(lte(grievancesTable.createdAt, to)); }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db.select().from(grievancesTable).where(where)
        .orderBy(desc(grievancesTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(grievancesTable).where(where),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);
    res.json({
      items: items.map(serializeGrievance),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[grievances] list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances/officers — staff only (list staff users available for assignment)
router.get("/grievances/officers", requireStaff, async (_req, res) => {
  try {
    const officers = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.isActive, "true"))
      .orderBy(usersTable.name);
    res.json({ officers });
  } catch (err) {
    console.error("[grievances] officers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/grievances/:id/priority — staff only
router.patch("/grievances/:id/priority", requireStaff, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const PriorityBody = z.object({
      priority: z.enum(["Low", "Medium", "High", "Urgent"]),
    });
    const body = PriorityBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [current] = await db.select().from(grievancesTable).where(eq(grievancesTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Grievance not found" }); return; }

    const [updated] = await db.update(grievancesTable)
      .set({ priority: body.data.priority })
      .where(eq(grievancesTable.id, id))
      .returning();

    res.json(serializeGrievance(updated));
  } catch (err) {
    console.error("[grievances] priority update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances/:id — staff only (full detail, ALL remarks including internal)
router.get("/grievances/:id", requireStaff, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [grievance] = await db.select().from(grievancesTable)
      .where(eq(grievancesTable.id, id)).limit(1);
    if (!grievance) { res.status(404).json({ error: "Grievance not found" }); return; }

    const [remarks, statusLog, attachments] = await Promise.all([
      db.select().from(grievanceRemarksTable)
        .where(eq(grievanceRemarksTable.grievanceId, id))
        .orderBy(grievanceRemarksTable.createdAt),
      db.select().from(grievanceStatusLogTable)
        .where(eq(grievanceStatusLogTable.grievanceId, id))
        .orderBy(grievanceStatusLogTable.createdAt),
      db.select().from(grievanceAttachmentsTable)
        .where(eq(grievanceAttachmentsTable.grievanceId, id))
        .orderBy(grievanceAttachmentsTable.createdAt),
    ]);

    // If a voter is linked AND it's in scope for the caller, surface a
    // small DTO so the UI can render the chip without a follow-up call.
    // Out-of-scope viewers see `voterId` (so they know a link exists)
    // but no PII.
    let voter: {
      id: number;
      epicNumber: string;
      fullName: string;
      pollingStationId: number | null;
      boothNo: string | null;
      boothName: string | null;
    } | null = null;
    if (grievance.voterId != null && req.user) {
      const scope = await getVoterScopeForUser(req.user);
      const allowed = scope.unrestricted ? null : await resolveScopeBoothIds(scope);
      const [v] = await db
        .select({
          id: votersTable.id,
          epicNumber: votersTable.epicNumber,
          fullName: votersTable.fullName,
          pollingStationId: votersTable.pollingStationId,
          boothNo: pollingStationsTable.boothNo,
          boothName: pollingStationsTable.name,
        })
        .from(votersTable)
        .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, votersTable.pollingStationId))
        .where(eq(votersTable.id, grievance.voterId))
        .limit(1);
      if (v) {
        const inScope = scope.unrestricted ||
          (v.pollingStationId != null && (allowed?.includes(v.pollingStationId) ?? false));
        if (inScope) voter = v;
      }
    }

    // Out-of-scope viewers must not see *any* identifier of the linked
    // voter — not even the bare voterId — so officers cannot enumerate
    // voters outside their assigned booths via the grievance detail.
    const baseSerialized = serializeGrievance(grievance);
    const safeSerialized = grievance.voterId != null && voter == null
      ? { ...baseSerialized, voterId: null }
      : baseSerialized;
    res.json({
      ...safeSerialized,
      voter,
      remarks: remarks.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      statusLog: statusLog.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      attachments: attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    });
  } catch (err) {
    console.error("[grievances] detail error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/grievances/:id/status — staff only
router.patch("/grievances/:id/status", requireStaff, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = StatusUpdateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [current] = await db.select().from(grievancesTable).where(eq(grievancesTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Grievance not found" }); return; }

    const updates: Partial<typeof grievancesTable.$inferInsert> = { status: body.data.status };
    if (body.data.status === "Resolved") updates.resolvedAt = new Date();

    const [updated] = await db.update(grievancesTable).set(updates)
      .where(eq(grievancesTable.id, id)).returning();

    await db.insert(grievanceStatusLogTable).values({
      grievanceId: id,
      fromStatus: current.status,
      toStatus: body.data.status,
      changedBy: req.user!.id,
      changedByName: req.user!.name,
      note: body.data.note ?? null,
    });

    res.json(serializeGrievance(updated));
  } catch (err) {
    console.error("[grievances] status update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/grievances/:id/remarks — staff only
router.post("/grievances/:id/remarks", requireStaff, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = RemarkBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [grievance] = await db.select({ id: grievancesTable.id }).from(grievancesTable)
      .where(eq(grievancesTable.id, id)).limit(1);
    if (!grievance) { res.status(404).json({ error: "Grievance not found" }); return; }

    const [remark] = await db.insert(grievanceRemarksTable).values({
      grievanceId: id,
      remark: body.data.remark,
      isPublic: body.data.isPublic ?? true,
      authorId: req.user!.id,
      authorName: req.user!.name,
    }).returning();

    res.status(201).json({ ...remark, createdAt: remark.createdAt.toISOString() });
  } catch (err) {
    console.error("[grievances] remark error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/grievances/:id/assign — staff only
router.post("/grievances/:id/assign", requireStaff, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = AssignBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [current] = await db.select().from(grievancesTable)
      .where(eq(grievancesTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Grievance not found" }); return; }

    const [updated] = await db.update(grievancesTable)
      .set({ assignedTo: body.data.officerId, status: "Assigned" })
      .where(eq(grievancesTable.id, id))
      .returning();

    await db.insert(grievanceStatusLogTable).values({
      grievanceId: id,
      fromStatus: current.status,
      toStatus: "Assigned",
      changedBy: req.user!.id,
      changedByName: req.user!.name,
      note: body.data.note ?? `Assigned to ${body.data.officerName}`,
    });

    // Routing-log entry for the manual reassignment
    await logRouting({
      grievanceId: id,
      fromOfficerId: current.assignedTo,
      toOfficerId: body.data.officerId,
      reason: current.assignedTo == null ? "manual" : "reassign",
      matchedScope: "none",
      matchedScopeId: null,
      changedBy: req.user!.id,
      changedByName: req.user!.name,
      note: body.data.note ?? `Manually assigned to ${body.data.officerName}`,
    });

    res.json(serializeGrievance(updated));
  } catch (err) {
    console.error("[grievances] assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Voter-link audit helper ──────────────────────────────────────
async function logGrievanceAudit(
  req: AuthRequest,
  action: string,
  target: string,
  detail?: string | null,
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

// Loads a grievance by id and returns null if not found. (No scope
// restriction — staff can view any grievance; voter-link operations
// only require that the *voter* be in scope.)
async function loadGrievance(id: number) {
  const [g] = await db
    .select()
    .from(grievancesTable)
    .where(eq(grievancesTable.id, id))
    .limit(1);
  return g ?? null;
}

// Grievance-scope check for voter-link operations. Mirrors the inbox
// scoping in GET /api/grievances: a `grievance_officer` may only act
// on grievances assigned to them; admins / coordinators / super_admin
// are unrestricted. Returns true if the caller may act on this grievance.
function userCanActOnGrievance(
  user: NonNullable<AuthRequest["user"]>,
  grievance: { assignedTo: number | null },
): boolean {
  if (user.role === "grievance_officer") {
    return grievance.assignedTo === user.id;
  }
  return true;
}

// ── GET /api/admin/grievances/:id/voter-suggestions ───────────────
// Returns top 3 voter candidates ranked by name + ward similarity,
// scoped to the actor's voter scope. Used by the grievance detail
// page to populate the "Match voter" panel.
router.get("/admin/grievances/:id/voter-suggestions", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const grievance = await loadGrievance(id);
    if (!grievance) { res.status(404).json({ error: "Not found" }); return; }
    if (!userCanActOnGrievance(req.user, grievance)) {
      await logGrievanceAudit(req, "GRIEVANCE_VOTER_SUGGEST_DENIED",
        `grievance:${grievance.ticketNo}`, "grievance_out_of_scope");
      res.status(403).json({ error: "You cannot access this grievance" });
      return;
    }

    const scope = await getVoterScopeForUser(req.user);
    const allowed = scope.unrestricted ? null : await resolveScopeBoothIds(scope);
    // Empty scope → no candidates can possibly match.
    if (allowed != null && allowed.length === 0) {
      res.json({ items: [] });
      return;
    }

    const name = (grievance.name || "").trim();
    if (name.length < 2) { res.json({ items: [] }); return; }

    // pg_trgm similarity on lower(full_name) vs the grievance name,
    // plus a +0.15 ward-match boost. Threshold 0.18 keeps obvious
    // mismatches out while still surfacing reasonable typos.
    const wardName = (grievance.ward || "").trim();
    const scopeFilter = allowed != null
      ? sql`AND v.polling_station_id = ANY(${sql.raw(`ARRAY[${allowed.join(",") || "NULL"}]::int[]`)})`
      : sql``;
    const rows = await db.execute(sql`
      SELECT
        v.id,
        v.epic_number       AS "epicNumber",
        v.full_name         AS "fullName",
        v.full_name_ta      AS "fullNameTa",
        v.age,
        v.gender,
        v.house_number      AS "houseNumber",
        v.address_line      AS "addressLine",
        v.polling_station_id AS "pollingStationId",
        ps.booth_no         AS "boothNo",
        ps.name             AS "boothName",
        w.id                AS "wardId",
        w.name              AS "wardName",
        similarity(lower(v.full_name), lower(${name})) AS "nameSim",
        CASE
          WHEN ${wardName === "" ? sql`FALSE` : sql`w.name = ${wardName}`} THEN 0.15
          ELSE 0
        END AS "wardBoost"
      FROM voters v
      LEFT JOIN polling_stations ps ON ps.id = v.polling_station_id
      LEFT JOIN wards w ON w.id = ps.ward_id
      WHERE similarity(lower(v.full_name), lower(${name})) > 0.18
        ${scopeFilter}
      ORDER BY (similarity(lower(v.full_name), lower(${name}))
                + CASE WHEN ${wardName === "" ? sql`FALSE` : sql`w.name = ${wardName}`} THEN 0.15 ELSE 0 END) DESC
      LIMIT 3
    `);

    const items = (rows.rows ?? rows as unknown as Array<Record<string, unknown>>).map((r) => {
      const nameSim = Number(r.nameSim ?? 0);
      const wardBoost = Number(r.wardBoost ?? 0);
      const similarity = Math.min(1, Math.round((nameSim + wardBoost) * 100) / 100);
      return {
        id: Number(r.id),
        epicNumber: r.epicNumber as string,
        fullName: r.fullName as string,
        fullNameTa: (r.fullNameTa as string | null) ?? null,
        age: r.age == null ? null : Number(r.age),
        gender: (r.gender as string | null) ?? null,
        houseNumber: (r.houseNumber as string | null) ?? null,
        addressLine: (r.addressLine as string | null) ?? null,
        pollingStationId: r.pollingStationId == null ? null : Number(r.pollingStationId),
        boothNo: (r.boothNo as string | null) ?? null,
        boothName: (r.boothName as string | null) ?? null,
        wardId: r.wardId == null ? null : Number(r.wardId),
        wardName: (r.wardName as string | null) ?? null,
        similarity,
        sameWard: wardBoost > 0,
      };
    });

    await logGrievanceAudit(
      req, "GRIEVANCE_VOTER_SUGGEST",
      `grievance:${grievance.ticketNo}`,
      `count=${items.length}`,
    );
    res.json({ items });
  } catch (err) {
    console.error("[grievances] voter suggestions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const LinkVoterBody = z.object({
  voterId: z.number().int().positive(),
  note: z.string().max(500).optional().nullable(),
});

// ── PUT /api/admin/grievances/:id/voter ──────────────────────────
// Link a grievance to a voter. The chosen voter must be in the
// caller's voter scope. Idempotent (re-linking the same voter is a
// no-op that still logs).
router.put("/admin/grievances/:id/voter", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const body = LinkVoterBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }

    const grievance = await loadGrievance(id);
    if (!grievance) { res.status(404).json({ error: "Not found" }); return; }
    if (!userCanActOnGrievance(req.user, grievance)) {
      await logGrievanceAudit(req, "GRIEVANCE_VOTER_LINK_DENIED",
        `grievance:${grievance.ticketNo}`,
        `voter:${body.data.voterId} grievance_out_of_scope`);
      res.status(403).json({ error: "You cannot modify this grievance" });
      return;
    }

    const [voter] = await db
      .select({ id: votersTable.id, epicNumber: votersTable.epicNumber, pollingStationId: votersTable.pollingStationId })
      .from(votersTable)
      .where(eq(votersTable.id, body.data.voterId))
      .limit(1);
    if (!voter) { res.status(404).json({ error: "Voter not found" }); return; }

    // Voter scope check — refuse to link a voter the caller cannot see.
    const scope = await getVoterScopeForUser(req.user);
    if (!scope.unrestricted) {
      const allowed = await resolveScopeBoothIds(scope);
      const inScope = voter.pollingStationId != null && (allowed?.includes(voter.pollingStationId) ?? false);
      if (!inScope) {
        await logGrievanceAudit(req, "GRIEVANCE_VOTER_LINK_DENIED",
          `grievance:${grievance.ticketNo}`, `voter:${voter.epicNumber} out_of_scope`);
        res.status(403).json({ error: "Voter is not in your assigned scope" });
        return;
      }
    }

    const previous = grievance.voterId ?? null;
    const [updated] = await db.update(grievancesTable)
      .set({ voterId: voter.id })
      .where(eq(grievancesTable.id, id))
      .returning();

    await db.insert(grievanceVoterLinkLogTable).values({
      grievanceId: id,
      voterIdOld: previous,
      voterIdNew: voter.id,
      reason: "manual",
      changedBy: req.user.id,
      changedByName: req.user.name,
      note: body.data.note ?? null,
    });
    await logGrievanceAudit(req, "GRIEVANCE_VOTER_LINK",
      `grievance:${grievance.ticketNo}`, `voter:${voter.epicNumber}`);

    res.json(serializeGrievance(updated));
  } catch (err) {
    console.error("[grievances] voter link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/admin/grievances/:id/voter ───────────────────────
// Clear the voter link. To unlink a voter the caller cannot see, the
// caller must be unrestricted (super_admin / admin). Officers can
// only unlink voters in their own scope — same rule as link.
router.delete("/admin/grievances/:id/voter", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }

    const grievance = await loadGrievance(id);
    if (!grievance) { res.status(404).json({ error: "Not found" }); return; }
    if (!userCanActOnGrievance(req.user, grievance)) {
      await logGrievanceAudit(req, "GRIEVANCE_VOTER_UNLINK_DENIED",
        `grievance:${grievance.ticketNo}`, "grievance_out_of_scope");
      res.status(403).json({ error: "You cannot modify this grievance" });
      return;
    }
    if (grievance.voterId == null) { res.json(serializeGrievance(grievance)); return; }

    const scope = await getVoterScopeForUser(req.user);
    if (!scope.unrestricted) {
      const [v] = await db.select({ pollingStationId: votersTable.pollingStationId, epicNumber: votersTable.epicNumber })
        .from(votersTable).where(eq(votersTable.id, grievance.voterId)).limit(1);
      const allowed = await resolveScopeBoothIds(scope);
      const inScope = v?.pollingStationId != null && (allowed?.includes(v.pollingStationId) ?? false);
      if (!inScope) {
        await logGrievanceAudit(req, "GRIEVANCE_VOTER_UNLINK_DENIED",
          `grievance:${grievance.ticketNo}`, `voter:${v?.epicNumber ?? grievance.voterId} out_of_scope`);
        res.status(403).json({ error: "Linked voter is not in your assigned scope" });
        return;
      }
    }

    const previous = grievance.voterId;
    const [updated] = await db.update(grievancesTable)
      .set({ voterId: null })
      .where(eq(grievancesTable.id, id))
      .returning();

    await db.insert(grievanceVoterLinkLogTable).values({
      grievanceId: id,
      voterIdOld: previous,
      voterIdNew: null,
      reason: "unlink",
      changedBy: req.user.id,
      changedByName: req.user.name,
    });
    await logGrievanceAudit(req, "GRIEVANCE_VOTER_UNLINK",
      `grievance:${grievance.ticketNo}`, `voter_id_old=${previous}`);

    res.json(serializeGrievance(updated));
  } catch (err) {
    console.error("[grievances] voter unlink error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
