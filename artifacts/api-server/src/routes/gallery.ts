import { Router } from "express";
import { db } from "@workspace/db";
import { galleryTable } from "@workspace/db/schema";
import { ListGalleryQueryParams, ListGalleryResponse } from "@workspace/api-zod";
import { eq, desc, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/gallery", async (req, res) => {
  try {
    const query = ListGalleryQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
    const { page = 1, limit = 20, type, album } = query.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (type) conditions.push(eq(galleryTable.mediaType, type));
    if (album) conditions.push(eq(galleryTable.album, album));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [items, [{ count }]] = await Promise.all([
      db.select().from(galleryTable).where(where).orderBy(desc(galleryTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(galleryTable).where(where),
    ]);

    const totalPages = Math.ceil(count / limit);
    res.json({ items: items.map(g => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })), total: count, page, totalPages });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
