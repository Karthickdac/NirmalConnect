import { Router } from "express";
import { db } from "@workspace/db";
import { developmentProjectsTable } from "@workspace/db/schema";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/development-projects", async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(developmentProjectsTable)
      .orderBy(asc(developmentProjectsTable.sortOrder), asc(developmentProjectsTable.id));
    res.json(items.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
