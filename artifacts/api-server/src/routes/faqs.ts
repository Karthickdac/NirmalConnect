import { Router } from "express";
import { db } from "@workspace/db";
import { faqsTable } from "@workspace/db/schema";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/faqs", async (_req, res) => {
  try {
    const faqs = await db.select().from(faqsTable).orderBy(asc(faqsTable.order));
    res.json(faqs.map(f => ({ ...f, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
