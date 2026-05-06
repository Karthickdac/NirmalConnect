import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { ListEventsQueryParams, ListEventsResponse, GetEventParams, GetEventResponse } from "@workspace/api-zod";
import { eq, desc, gte, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/events", async (req, res) => {
  try {
    const query = ListEventsQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
    const { page = 1, limit = 10, upcoming } = query.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (upcoming) conditions.push(gte(eventsTable.eventDate, new Date()));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [items, [{ count }]] = await Promise.all([
      db.select().from(eventsTable).where(where).orderBy(desc(eventsTable.eventDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(eventsTable).where(where),
    ]);

    const totalPages = Math.ceil(count / limit);
    res.json({ items: items.map(e => ({ ...e, eventDate: e.eventDate.toISOString(), endDate: e.endDate?.toISOString() ?? null, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() })), total: count, page, totalPages });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events/:id", async (req, res) => {
  try {
    const params = GetEventParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, params.data.id)).limit(1);
    if (!event) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...event, eventDate: event.eventDate.toISOString(), endDate: event.endDate?.toISOString() ?? null, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upcoming events wow endpoint
router.get("/events/upcoming/list", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 3;
    const items = await db.select().from(eventsTable).where(gte(eventsTable.eventDate, new Date())).orderBy(eventsTable.eventDate).limit(limit);
    res.json(items.map(e => ({ ...e, eventDate: e.eventDate.toISOString(), endDate: e.endDate?.toISOString() ?? null, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
