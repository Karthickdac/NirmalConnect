import { Router } from "express";
import { db } from "@workspace/db";
import { newsTable } from "@workspace/db/schema";
import { ListNewsQueryParams, ListNewsResponse, GetNewsArticleParams, GetNewsArticleResponse } from "@workspace/api-zod";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

// GET /api/news
router.get("/news", async (req, res) => {
  try {
    const query = ListNewsQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
    const { page = 1, limit = 10, featured } = query.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (featured !== undefined) conditions.push(eq(newsTable.featured, featured));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [items, [{ count }]] = await Promise.all([
      db.select().from(newsTable).where(where).orderBy(desc(newsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(newsTable).where(where),
    ]);

    const totalPages = Math.ceil(count / limit);
    const response = ListNewsResponse.parse({ items: items.map(a => ({ ...a, publishedAt: a.publishedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })), total: count, page, totalPages });
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/news/:id
router.get("/news/:id", async (req, res) => {
  try {
    const params = GetNewsArticleParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const [article] = await db.select().from(newsTable).where(eq(newsTable.id, params.data.id)).limit(1);
    if (!article) { res.status(404).json({ error: "Not found" }); return; }
    const response = GetNewsArticleResponse.parse({ ...article, publishedAt: article.publishedAt?.toISOString() ?? null, createdAt: article.createdAt.toISOString(), updatedAt: article.updatedAt.toISOString() });
    res.json(response);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/news/featured/latest
router.get("/news/featured/latest", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const items = await db.select().from(newsTable).where(eq(newsTable.featured, true)).orderBy(desc(newsTable.createdAt)).limit(limit);
    res.json(items.map(a => ({ ...a, publishedAt: a.publishedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
