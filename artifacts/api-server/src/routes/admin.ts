import { Router } from "express";
import { db } from "@workspace/db";
import {
  newsTable, eventsTable, activitiesTable, galleryTable,
  volunteersTable, faqsTable, grievancesTable, usersTable,
  siteConfigTable, auditLogTable,
} from "@workspace/db/schema";
import { requireStaff, type AuthRequest } from "../lib/auth.js";
import { eq, desc, asc, sql, gte, lte, and, count } from "drizzle-orm";
import { z } from "zod";

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
// NEWS CRUD
// ──────────────────────────────────────────────────────────
const NewsBody = z.object({
  title: z.string().min(2),
  titleTa: z.string().optional().nullable(),
  content: z.string().min(10),
  contentTa: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  category: z.string().default("general"),
  featured: z.boolean().default(false),
  publishedAt: z.string().optional().nullable(),
});

router.post("/admin/news", async (req: AuthRequest, res) => {
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

router.put("/admin/news/:id", async (req: AuthRequest, res) => {
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

router.delete("/admin/news/:id", async (req: AuthRequest, res) => {
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
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  venue: z.string().min(2),
  eventDate: z.string(),
  endDate: z.string().optional().nullable(),
  category: z.string().default("general"),
});

router.post("/admin/events", async (req: AuthRequest, res) => {
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

router.put("/admin/events/:id", async (req: AuthRequest, res) => {
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

router.delete("/admin/events/:id", async (req: AuthRequest, res) => {
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
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  activityDate: z.string(),
  location: z.string().optional().nullable(),
  category: z.string().default("general"),
});

router.post("/admin/activities", async (req: AuthRequest, res) => {
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

router.put("/admin/activities/:id", async (req: AuthRequest, res) => {
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

router.delete("/admin/activities/:id", async (req: AuthRequest, res) => {
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
// GALLERY CRUD
// ──────────────────────────────────────────────────────────
const GalleryBody = z.object({
  title: z.string().min(1),
  mediaUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional().nullable().or(z.literal("")),
  mediaType: z.enum(["photo", "video"]).default("photo"),
  album: z.string().optional().nullable(),
});

router.post("/admin/gallery", async (req: AuthRequest, res) => {
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

router.delete("/admin/gallery/:id", async (req: AuthRequest, res) => {
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

router.patch("/admin/volunteers/:id/status", async (req: AuthRequest, res) => {
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

router.post("/admin/faqs", async (req: AuthRequest, res) => {
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

router.put("/admin/faqs/:id", async (req: AuthRequest, res) => {
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

router.delete("/admin/faqs/:id", async (req: AuthRequest, res) => {
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

router.put("/admin/about", async (req: AuthRequest, res) => {
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

router.put("/admin/settings/:key", async (req: AuthRequest, res) => {
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
// AUDIT LOG
// ──────────────────────────────────────────────────────────
router.get("/admin/audit-log", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "50")));
    const logs = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit);
    res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
  } catch (err) {
    console.error("[admin] audit-log:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
