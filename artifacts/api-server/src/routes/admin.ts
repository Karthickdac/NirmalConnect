import { Router } from "express";
import { db } from "@workspace/db";
import {
  newsTable, eventsTable, activitiesTable, galleryTable,
  volunteersTable, faqsTable, grievancesTable, usersTable,
  siteConfigTable, auditLogTable, bannersTable, constituencyStatsTable, wardsTable,
} from "@workspace/db/schema";

import { requireStaff, requireRole, type AuthRequest } from "../lib/auth.js";
import { eq, desc, asc, sql, gte, lte, and, inArray } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

// ── Image upload config (CMS forms) ────────────────────────
const adminUploadsDir = path.join(process.cwd(), "uploads", "admin");
if (!fs.existsSync(adminUploadsDir)) fs.mkdirSync(adminUploadsDir, { recursive: true });

const adminUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, adminUploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const adminUpload = multer({
  storage: adminUploadStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^\.(jpe?g|png|gif|webp|svg)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

/** Accepts an http(s) URL OR a server-relative path under /uploads or /api/uploads. */
const ImageRef = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      /^https?:\/\//i.test(v) ||
      v.startsWith("/uploads/") ||
      v.startsWith("/api/uploads/"),
    { message: "Must be a URL or an /uploads/ path" },
  );

// ── Role constants used across routes ──────────────────────
const CMS_ROLES       = ["super_admin", "admin", "pa_staff", "media_team"] as const;
const EVENTS_ROLES    = ["super_admin", "admin", "pa_staff", "media_team", "constituency_coordinator"] as const;
const VOLUNTEER_ROLES = ["super_admin", "admin", "grievance_officer", "constituency_coordinator"] as const;
const WARD_ROLES      = ["super_admin", "admin", "constituency_coordinator"] as const;

const router = Router();

router.use(requireStaff);

async function logAudit(req: AuthRequest, action: string, target: string, detail?: string) {
  try {
    await db.insert(auditLogTable).values({
      actorId: req.user?.id ?? null,
      actorName: req.user?.name ?? "Unknown",
      action,
      target,
      detail: detail ?? null,
    });
  } catch {
    // audit log is non-critical
  }
}

// ──────────────────────────────────────────────────────────
// GET /api/admin/dashboard — KPI + chart data
// ──────────────────────────────────────────────────────────
router.get("/admin/dashboard", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      [{ totalGrievances }],
      [{ openGrievances }],
      [{ resolvedGrievances }],
      [{ totalVolunteers }],
      [{ pendingVolunteers }],
      [{ approvedVolunteers }],
      [{ eventsThisMonth }],
      [{ totalNews }],
      [{ totalActivities }],
      [{ totalGallery }],
      [{ avgResolutionHours }],
      grievancesByCategory,
      grievancesByStatus,
      grievancesByPriority,
      recentAuditLog,
    ] = await Promise.all([
      db.select({ totalGrievances: sql<number>`count(*)::int` }).from(grievancesTable),
      db.select({ openGrievances: sql<number>`count(*)::int` }).from(grievancesTable)
        .where(sql`status NOT IN ('Resolved','Closed')`),
      db.select({ resolvedGrievances: sql<number>`count(*)::int` }).from(grievancesTable)
        .where(sql`status IN ('Resolved','Closed')`),
      db.select({ totalVolunteers: sql<number>`count(*)::int` }).from(volunteersTable),
      db.select({ pendingVolunteers: sql<number>`count(*)::int` }).from(volunteersTable)
        .where(eq(volunteersTable.status, "pending")),
      db.select({ approvedVolunteers: sql<number>`count(*)::int` }).from(volunteersTable)
        .where(eq(volunteersTable.status, "approved")),
      db.select({ eventsThisMonth: sql<number>`count(*)::int` }).from(eventsTable)
        .where(gte(eventsTable.eventDate, startOfMonth)),
      db.select({ totalNews: sql<number>`count(*)::int` }).from(newsTable),
      db.select({ totalActivities: sql<number>`count(*)::int` }).from(activitiesTable),
      db.select({ totalGallery: sql<number>`count(*)::int` }).from(galleryTable),
      // Avg resolution time in hours for resolved/closed grievances
      db.select({
        avgResolutionHours: sql<number>`
          coalesce(
            round(
              avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric, 1
            )::float, 0
          )
        `,
      }).from(grievancesTable)
        .where(sql`status IN ('Resolved','Closed') AND resolved_at IS NOT NULL`),
      db.select({ category: grievancesTable.category, count: sql<number>`count(*)::int` })
        .from(grievancesTable).groupBy(grievancesTable.category).orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ status: grievancesTable.status, count: sql<number>`count(*)::int` })
        .from(grievancesTable).groupBy(grievancesTable.status),
      db.select({ priority: grievancesTable.priority, count: sql<number>`count(*)::int` })
        .from(grievancesTable).groupBy(grievancesTable.priority),
      db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(20),
    ]);

    // Monthly trend: last 6 months of grievance submissions
    const monthlyRows = await db.select({
      month: sql<string>`to_char(created_at, 'YYYY-MM')`,
      submitted: sql<number>`count(*)::int`,
      resolved: sql<number>`sum(case when status in ('Resolved','Closed') then 1 else 0 end)::int`,
    }).from(grievancesTable)
      .where(gte(grievancesTable.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1)))
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

    const resolutionRate = totalGrievances > 0 ? Math.round((resolvedGrievances / totalGrievances) * 100) : 0;

    res.json({
      kpi: {
        totalGrievances,
        openGrievances,
        resolvedGrievances,
        resolutionRate,
        avgResolutionHours,
        totalVolunteers,
        pendingVolunteers,
        approvedVolunteers,
        eventsThisMonth,
        totalNews,
        totalActivities,
        totalGallery,
      },
      grievancesByCategory,
      grievancesByStatus,
      grievancesByPriority,
      monthlyTrend: monthlyRows,
      recentAuditLog: recentAuditLog.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    });
  } catch (err) {
    console.error("[admin] dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/admin/upload — image upload for CMS forms
// ──────────────────────────────────────────────────────────
router.post(
  "/admin/upload",
  requireRole(...CMS_ROLES, "constituency_coordinator"),
  (req: AuthRequest, res, next) => {
    adminUpload.single("file")(req, res, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        res.status(400).json({ error: msg });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded (field name: 'file')" });
        return;
      }
      // Use /api/uploads so the dev/prod path-based proxy (which only routes /api
      // to this service) can serve the file directly from <web origin>/api/uploads/…
      const url = `/api/uploads/admin/${req.file.filename}`;
      logAudit(req, "UPLOAD", `image:${req.file.filename}`, req.file.originalname).catch(() => null);
      res.status(201).json({
        url,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
      next?.();
    });
  },
);

// ──────────────────────────────────────────────────────────
// NEWS CRUD
// ──────────────────────────────────────────────────────────
const NewsBody = z.object({
  title: z.string().min(2),
  titleTa: z.string().optional().nullable(),
  content: z.string().min(10),
  contentTa: z.string().optional().nullable(),
  imageUrl: ImageRef.optional().nullable(),
  category: z.string().default("general"),
  featured: z.boolean().default(false),
  publishedAt: z.string().optional().nullable(),
});

router.post("/admin/news", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = NewsBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { publishedAt, imageUrl, ...rest } = body.data;
    const [item] = await db.insert(newsTable).values({
      ...rest,
      imageUrl: imageUrl || null,
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
    }).returning();
    await logAudit(req, "CREATE", `news:${item.id}`, item.title);
    res.status(201).json({ ...item, publishedAt: item.publishedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] news create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/news/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = NewsBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { publishedAt, imageUrl, ...rest } = body.data;
    const [item] = await db.update(newsTable).set({
      ...rest,
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
      ...(publishedAt !== undefined && { publishedAt: publishedAt ? new Date(publishedAt) : null }),
    }).where(eq(newsTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `news:${id}`, item.title);
    res.json({ ...item, publishedAt: item.publishedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] news update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/news/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(newsTable).where(eq(newsTable.id, id));
    await logAudit(req, "DELETE", `news:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] news delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// EVENTS CRUD
// ──────────────────────────────────────────────────────────
const EventBody = z.object({
  title: z.string().min(2),
  titleTa: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionTa: z.string().optional().nullable(),
  imageUrl: ImageRef.optional().nullable(),
  venue: z.string().min(2),
  eventDate: z.string(),
  endDate: z.string().optional().nullable(),
  category: z.string().default("general"),
});

router.post("/admin/events", requireRole(...EVENTS_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = EventBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { imageUrl, endDate, ...rest } = body.data;
    const [item] = await db.insert(eventsTable).values({
      ...rest,
      imageUrl: imageUrl || null,
      eventDate: new Date(rest.eventDate),
      endDate: endDate ? new Date(endDate) : null,
    }).returning();
    await logAudit(req, "CREATE", `events:${item.id}`, item.title);
    res.status(201).json({ ...item, eventDate: item.eventDate.toISOString(), endDate: item.endDate?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] events create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/events/:id", requireRole(...EVENTS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = EventBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { imageUrl, eventDate, endDate, ...rest } = body.data;
    const [item] = await db.update(eventsTable).set({
      ...rest,
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
      ...(eventDate && { eventDate: new Date(eventDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
    }).where(eq(eventsTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `events:${id}`, item.title);
    res.json({ ...item, eventDate: item.eventDate.toISOString(), endDate: item.endDate?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] events update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/events/:id", requireRole(...EVENTS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(eventsTable).where(eq(eventsTable.id, id));
    await logAudit(req, "DELETE", `events:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] events delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// ACTIVITIES CRUD
// ──────────────────────────────────────────────────────────
const ActivityBody = z.object({
  title: z.string().min(2),
  titleTa: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionTa: z.string().optional().nullable(),
  imageUrl: ImageRef.optional().nullable(),
  activityDate: z.string(),
  location: z.string().optional().nullable(),
  category: z.string().default("general"),
});

router.post("/admin/activities", requireRole(...EVENTS_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = ActivityBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { imageUrl, ...rest } = body.data;
    const [item] = await db.insert(activitiesTable).values({
      ...rest,
      imageUrl: imageUrl || null,
      activityDate: new Date(rest.activityDate),
    }).returning();
    await logAudit(req, "CREATE", `activities:${item.id}`, item.title);
    res.status(201).json({ ...item, activityDate: item.activityDate.toISOString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] activities create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/activities/:id", requireRole(...EVENTS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = ActivityBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { imageUrl, activityDate, ...rest } = body.data;
    const [item] = await db.update(activitiesTable).set({
      ...rest,
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
      ...(activityDate && { activityDate: new Date(activityDate) }),
    }).where(eq(activitiesTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `activities:${id}`, item.title);
    res.json({ ...item, activityDate: item.activityDate.toISOString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] activities update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/activities/:id", requireRole(...EVENTS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(activitiesTable).where(eq(activitiesTable.id, id));
    await logAudit(req, "DELETE", `activities:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] activities delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// GALLERY CRUD + REORDER
// ──────────────────────────────────────────────────────────
const GalleryBody = z.object({
  title: z.string().min(1),
  mediaUrl: ImageRef,
  thumbnailUrl: ImageRef.optional().nullable(),
  mediaType: z.enum(["photo", "video"]).default("photo"),
  album: z.string().optional().nullable(),
  displayOrder: z.number().int().default(0),
});

router.post("/admin/gallery", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = GalleryBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { thumbnailUrl, ...rest } = body.data;
    const [item] = await db.insert(galleryTable).values({
      ...rest,
      thumbnailUrl: thumbnailUrl || null,
    }).returning();
    await logAudit(req, "CREATE", `gallery:${item.id}`, item.title);
    res.status(201).json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] gallery create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/gallery/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = GalleryBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { thumbnailUrl, ...rest } = body.data;
    const [item] = await db.update(galleryTable).set({
      ...rest,
      ...(thumbnailUrl !== undefined && { thumbnailUrl: thumbnailUrl || null }),
    }).where(eq(galleryTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `gallery:${id}`, item.title);
    res.json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] gallery update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/gallery/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(galleryTable).where(eq(galleryTable.id, id));
    await logAudit(req, "DELETE", `gallery:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] gallery delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// VOLUNTEERS MANAGEMENT
// ──────────────────────────────────────────────────────────
router.get("/admin/volunteers", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const conditions = status ? [eq(volunteersTable.status, status)] : [];
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ total }]] = await Promise.all([
      db.select().from(volunteersTable).where(where).orderBy(desc(volunteersTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(volunteersTable).where(where),
    ]);
    const totalPages = Math.ceil(total / limit);
    res.json({
      items: items.map(v => ({ ...v, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() })),
      total,
      page,
      totalPages,
    });
  } catch (err) {
    console.error("[admin] volunteers list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/volunteers/:id/status", requireRole(...VOLUNTEER_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = z.object({ status: z.enum(["approved", "rejected", "pending"]) }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid status" }); return; }
    const [item] = await db.update(volunteersTable).set({ status: body.data.status })
      .where(eq(volunteersTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE_STATUS", `volunteer:${id}`, `${item.name} → ${body.data.status}`);
    res.json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] volunteer status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// FAQs CRUD
// ──────────────────────────────────────────────────────────
const FaqBody = z.object({
  question: z.string().min(5),
  questionTa: z.string().optional().nullable(),
  answer: z.string().min(5),
  answerTa: z.string().optional().nullable(),
  order: z.number().int().default(0),
});

router.get("/admin/faqs", async (_req, res) => {
  try {
    const faqs = await db.select().from(faqsTable).orderBy(asc(faqsTable.order));
    res.json(faqs.map(f => ({ ...f, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() })));
  } catch (err) {
    console.error("[admin] faqs list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/faqs", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = FaqBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const [item] = await db.insert(faqsTable).values(body.data).returning();
    await logAudit(req, "CREATE", `faq:${item.id}`, item.question);
    res.status(201).json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] faq create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/faqs/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = FaqBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const [item] = await db.update(faqsTable).set(body.data).where(eq(faqsTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `faq:${id}`, item.question);
    res.json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] faq update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/faqs/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(faqsTable).where(eq(faqsTable.id, id));
    await logAudit(req, "DELETE", `faq:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] faq delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// BULK GRIEVANCE ACTIONS
// ──────────────────────────────────────────────────────────
router.post("/admin/grievances/bulk-status", requireRole("super_admin", "admin", "grievance_officer"), async (req: AuthRequest, res) => {
  try {
    const body = z.object({
      ids: z.array(z.number().int()).min(1).max(200),
      status: z.enum(["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"]),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { ids, status } = body.data;
    const updated = await db.update(grievancesTable)
      .set({ status, ...(status === "Resolved" ? { resolvedAt: new Date() } : {}) })
      .where(inArray(grievancesTable.id, ids))
      .returning({ id: grievancesTable.id });
    await logAudit(req, "BULK_UPDATE", `grievances:${ids.join(",")}`, `→ ${status}`);
    res.json({ updated: updated.length });
  } catch (err) {
    console.error("[admin] bulk grievance status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// ABOUT CMS (site_config key-value store)
// ──────────────────────────────────────────────────────────
router.get("/admin/about", async (_req, res) => {
  try {
    const [row] = await db.select().from(siteConfigTable).where(eq(siteConfigTable.key, "about")).limit(1);
    if (!row) { res.json(null); return; }
    res.json(JSON.parse(row.value));
  } catch (err) {
    console.error("[admin] about get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/about", requireRole("super_admin", "admin", "pa_staff"), async (req: AuthRequest, res) => {
  try {
    const value = JSON.stringify(req.body);
    const existing = await db.select({ id: siteConfigTable.id }).from(siteConfigTable)
      .where(eq(siteConfigTable.key, "about")).limit(1);
    if (existing.length > 0) {
      await db.update(siteConfigTable).set({ value }).where(eq(siteConfigTable.key, "about"));
    } else {
      await db.insert(siteConfigTable).values({ key: "about", value });
    }
    await logAudit(req, "UPDATE", "site_config:about");
    res.json(req.body);
  } catch (err) {
    console.error("[admin] about update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// SITE SETTINGS (social links, contact info)
// ──────────────────────────────────────────────────────────
router.get("/admin/settings", async (_req, res) => {
  try {
    const rows = await db.select().from(siteConfigTable)
      .where(sql`key IN ('social_links','contact_info','emergency_contacts')`);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
    res.json(result);
  } catch (err) {
    console.error("[admin] settings get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/settings/:key", requireRole("super_admin", "admin"), async (req: AuthRequest, res) => {
  try {
    const key = req.params["key"] as string;
    const allowed = ["social_links", "contact_info", "emergency_contacts"];
    if (!allowed.includes(key)) { res.status(400).json({ error: "Invalid settings key" }); return; }
    const value = JSON.stringify(req.body);
    const existing = await db.select({ id: siteConfigTable.id }).from(siteConfigTable)
      .where(eq(siteConfigTable.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(siteConfigTable).set({ value }).where(eq(siteConfigTable.key, key));
    } else {
      await db.insert(siteConfigTable).values({ key, value });
    }
    await logAudit(req, "UPDATE", `site_config:${key}`);
    res.json(req.body);
  } catch (err) {
    console.error("[admin] settings update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// AUDIT LOG (paginated)
// ──────────────────────────────────────────────────────────
router.get("/admin/audit-log", requireRole("super_admin", "admin"), async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "50"))));
    const logs = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit);
    res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
  } catch (err) {
    console.error("[admin] audit-log:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// BANNERS CRUD
// ──────────────────────────────────────────────────────────
const BannerBody = z.object({
  title: z.string().min(1),
  titleTa: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  subtitleTa: z.string().optional().nullable(),
  ctaText: z.string().optional().nullable(),
  ctaUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

router.get("/admin/banners", async (_req, res) => {
  try {
    const items = await db.select().from(bannersTable).orderBy(bannersTable.displayOrder, desc(bannersTable.createdAt));
    res.json(items.map(b => ({ ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() })));
  } catch (err) {
    console.error("[admin] banners list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/banners", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = BannerBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const [item] = await db.insert(bannersTable).values(body.data).returning();
    await logAudit(req, "CREATE", `banner:${item.id}`, item.title);
    res.status(201).json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] banner create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/banners/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = BannerBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const [item] = await db.update(bannersTable).set(body.data).where(eq(bannersTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `banner:${id}`, item.title);
    res.json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] banner update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/banners/:id", requireRole(...CMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(bannersTable).where(eq(bannersTable.id, id));
    await logAudit(req, "DELETE", `banner:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] banner delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// CONSTITUENCY STATS
// ──────────────────────────────────────────────────────────
router.get("/admin/constituency-stats", async (_req, res) => {
  try {
    const [row] = await db.select().from(constituencyStatsTable).orderBy(asc(constituencyStatsTable.id)).limit(1);
    res.json(row ?? null);
  } catch (err) {
    console.error("[admin] constituency-stats get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const ConstituencyStatsBody = z.object({
  roadsBuiltKm: z.number().default(0),
  waterProjectsCompleted: z.number().int().default(0),
  schoolsUpgraded: z.number().int().default(0),
  healthClinicsOpened: z.number().int().default(0),
  jobsCreated: z.number().int().default(0),
  beneficiariesServed: z.number().int().default(0),
  totalProjects: z.number().int().default(0),
  completedProjects: z.number().int().default(0),
  ongoingProjects: z.number().int().default(0),
});

router.put("/admin/constituency-stats", requireRole("super_admin", "admin", "constituency_coordinator"), async (req: AuthRequest, res) => {
  try {
    const body = ConstituencyStatsBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const existing = await db.select({ id: constituencyStatsTable.id }).from(constituencyStatsTable).limit(1);
    let row;
    if (existing.length > 0) {
      [row] = await db.update(constituencyStatsTable).set(body.data).where(eq(constituencyStatsTable.id, existing[0].id)).returning();
    } else {
      [row] = await db.insert(constituencyStatsTable).values(body.data).returning();
    }
    await logAudit(req, "UPDATE", "constituency_stats");
    res.json(row);
  } catch (err) {
    console.error("[admin] constituency-stats update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// WARDS CRUD
// ──────────────────────────────────────────────────────────
const WardBody = z.object({
  name: z.string().min(1),
  area: z.string().optional().nullable(),
  coordinatorName: z.string().optional().nullable(),
  coordinatorPhone: z.string().optional().nullable(),
  coordinatorEmail: z.string().optional().nullable(),
  population: z.number().int().optional().nullable(),
  households: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get("/admin/wards", async (_req, res) => {
  try {
    const wards = await db.select().from(wardsTable).orderBy(wardsTable.name);
    res.json(wards.map(w => ({ ...w, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString() })));
  } catch (err) {
    console.error("[admin] wards list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/wards", requireRole(...WARD_ROLES), async (req: AuthRequest, res) => {
  try {
    const body = WardBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const [item] = await db.insert(wardsTable).values(body.data).returning();
    await logAudit(req, "CREATE", `ward:${item.id}`, item.name);
    res.status(201).json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] ward create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/wards/:id", requireRole(...WARD_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const body = WardBody.partial().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const [item] = await db.update(wardsTable).set(body.data).where(eq(wardsTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await logAudit(req, "UPDATE", `ward:${id}`, item.name);
    res.json({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  } catch (err) {
    console.error("[admin] ward update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/wards/:id", requireRole(...WARD_ROLES), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(wardsTable).where(eq(wardsTable.id, id));
    await logAudit(req, "DELETE", `ward:${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] ward delete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// BULK GRIEVANCE ASSIGN
// ──────────────────────────────────────────────────────────
router.post("/admin/grievances/bulk-assign", requireRole("super_admin", "admin", "grievance_officer"), async (req: AuthRequest, res) => {
  try {
    const body = z.object({
      ids: z.array(z.number().int()).min(1).max(200),
      officerId: z.number().int(),
      officerName: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Invalid", details: body.error.issues }); return; }
    const { ids, officerId, officerName } = body.data;
    const updated = await db.update(grievancesTable)
      .set({ assignedTo: officerId, status: "Assigned" })
      .where(inArray(grievancesTable.id, ids))
      .returning({ id: grievancesTable.id });
    await logAudit(req, "BULK_ASSIGN", `grievances:${ids.join(",")}`, `→ ${officerName}`);
    res.json({ updated: updated.length });
  } catch (err) {
    console.error("[admin] bulk grievance assign:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────────
// GRIEVANCES CSV EXPORT
// ──────────────────────────────────────────────────────────
router.get("/admin/grievances/export", async (_req, res) => {
  try {
    const rows = await db.select().from(grievancesTable).orderBy(desc(grievancesTable.createdAt)).limit(2000);
    const headers = ["ID", "Ticket No", "Name", "Phone", "Category", "Priority", "Status", "Ward", "Description", "Submitted"];
    const csv = [
      headers.map(h => `"${h}"`).join(","),
      ...rows.map(r => [
        r.id, r.ticketNo ?? "", r.name, r.phone, r.category, r.priority, r.status,
        r.ward ?? "", (r.description ?? "").replace(/"/g, '""'), new Date(r.createdAt).toLocaleDateString("en-IN"),
      ].map(v => `"${v}"`).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="grievances-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[admin] grievances export:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
