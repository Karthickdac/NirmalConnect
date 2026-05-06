import { Router } from "express";
import { db } from "@workspace/db";
import { siteConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/about", async (_req, res) => {
  try {
    const [row] = await db.select().from(siteConfigTable)
      .where(eq(siteConfigTable.key, "about")).limit(1);
    if (!row) { res.json(null); return; }
    res.json(JSON.parse(row.value));
  } catch (err) {
    console.error("[site] about get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
