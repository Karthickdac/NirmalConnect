import { Router } from "express";
import { db } from "@workspace/db";
import {
  grievancesTable,
  grievanceRemarksTable,
  grievanceStatusLogTable,
} from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../lib/auth.js";
import { eq, desc, and, sql, count } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod/v4";

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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx/;
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
});

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
router.post("/grievances/submit", upload.array("attachments", 3), async (req, res) => {
  try {
    const body = SubmitBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    let ticketNo = generateTicketNo();
    // Ensure uniqueness (retry once on collision)
    const existing = await db.select({ id: grievancesTable.id }).from(grievancesTable).where(eq(grievancesTable.ticketNo, ticketNo)).limit(1);
    if (existing.length > 0) ticketNo = generateTicketNo();

    const [grievance] = await db.insert(grievancesTable).values({
      ticketNo,
      name: body.data.name,
      phone: body.data.phone,
      email: body.data.email ?? null,
      category: body.data.category,
      description: body.data.description,
      address: body.data.address ?? null,
      ward: body.data.ward ?? null,
      constituency: body.data.constituency ?? "Tirupparankundram",
      anonymous: body.data.anonymous ?? false,
      priority: "Medium",
      status: "Submitted",
    }).returning();

    // Log status creation
    await db.insert(grievanceStatusLogTable).values({
      grievanceId: grievance.id,
      fromStatus: null,
      toStatus: "Submitted",
      changedByName: "System",
      note: "Grievance submitted by citizen",
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

    const totalResult = await db.select({ count: count() }).from(grievancesTable);
    const resolvedResult = await db.select({ count: count() }).from(grievancesTable)
      .where(eq(grievancesTable.status, "Resolved"));

    res.json({
      byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
      byWard: byWardRaw.filter((r) => r.ward).map((r) => ({ ward: r.ward!, count: Number(r.count) })),
      total: Number(totalResult[0]?.count ?? 0),
      resolved: Number(resolvedResult[0]?.count ?? 0),
    });
  } catch (err) {
    console.error("[grievances] heatmap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances/track/:ticketNo — public
router.get("/grievances/track/:ticketNo", async (req, res) => {
  try {
    const { ticketNo } = req.params;
    const [grievance] = await db.select().from(grievancesTable).where(eq(grievancesTable.ticketNo, ticketNo)).limit(1);
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

    res.json({
      ...serializeGrievance(grievance),
      name: grievance.anonymous ? "Anonymous" : grievance.name,
      phone: grievance.anonymous ? "***" : grievance.phone,
      remarks: remarks.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      statusLog: statusLog.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[grievances] track error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/grievances — staff only
router.get("/grievances", requireAuth, async (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.status) conditions.push(eq(grievancesTable.status, String(req.query.status)));
    if (req.query.category) conditions.push(eq(grievancesTable.category, String(req.query.category)));
    if (req.query.priority) conditions.push(eq(grievancesTable.priority, String(req.query.priority)));
    if (req.query.ward) conditions.push(eq(grievancesTable.ward, String(req.query.ward)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db.select().from(grievancesTable).where(where).orderBy(desc(grievancesTable.createdAt)).limit(limit).offset(offset),
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

// PATCH /api/grievances/:id/status — staff only
router.patch("/grievances/:id/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = StatusUpdateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [current] = await db.select().from(grievancesTable).where(eq(grievancesTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Grievance not found" }); return; }

    const updates: Partial<typeof grievancesTable.$inferInsert> = {
      status: body.data.status,
    };
    if (body.data.status === "Resolved") updates.resolvedAt = new Date();

    const [updated] = await db.update(grievancesTable).set(updates).where(eq(grievancesTable.id, id)).returning();

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
router.post("/grievances/:id/remarks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = RemarkBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [grievance] = await db.select({ id: grievancesTable.id }).from(grievancesTable).where(eq(grievancesTable.id, id)).limit(1);
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
router.post("/grievances/:id/assign", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = AssignBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error.issues });
      return;
    }

    const [current] = await db.select().from(grievancesTable).where(eq(grievancesTable.id, id)).limit(1);
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

    res.json(serializeGrievance(updated));
  } catch (err) {
    console.error("[grievances] assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
