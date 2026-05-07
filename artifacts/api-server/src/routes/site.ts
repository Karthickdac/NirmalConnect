import { Router } from "express";
import { db } from "@workspace/db";
import { siteConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Public, unauthenticated read of the "about" CMS entry.
// Mirrors GET /api/admin/about (which is staff-only) so the public
// About page can render live CMS content without exposing admin routes.
// Returns the parsed JSON value, or null when no CMS content exists yet
// (the frontend then falls back to its built-in DEFAULT_CONFIG).
router.get("/about", async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(siteConfigTable)
      .where(eq(siteConfigTable.key, "about"))
      .limit(1);
    if (!row) {
      res.json(null);
      return;
    }
    res.json(JSON.parse(row.value));
  } catch (err) {
    console.error("[site] about get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
