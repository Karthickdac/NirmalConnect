import { Router } from "express";
import { db } from "@workspace/db";
import { activitiesTable } from "@workspace/db/schema";
import { ListActivitiesQueryParams, ListActivitiesResponse } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/activities", async (req, res) => {
  try {
    const query = ListActivitiesQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
    const { page = 1, limit = 10 } = query.data;
    const offset = (page - 1) * limit;

    const [items, [{ count }]] = await Promise.all([
      db.select().from(activitiesTable).orderBy(desc(activitiesTable.activityDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(activitiesTable),
    ]);

    const totalPages = Math.ceil(count / limit);
    res.json({ items: items.map(a => ({ ...a, activityDate: a.activityDate.toISOString(), createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })), total: count, page, totalPages });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Recent activities wow endpoint
router.get("/activities/recent", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const items = await db.select().from(activitiesTable).orderBy(desc(activitiesTable.activityDate)).limit(limit);
    res.json(items.map(a => ({ ...a, activityDate: a.activityDate.toISOString(), createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
