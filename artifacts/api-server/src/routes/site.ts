import { Router } from "express";
import { db } from "@workspace/db";
import { siteConfigTable, wardsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Public, unauthenticated list of wards/areas — used by the public
// Grievance and Volunteer forms (and officer filters) so users pick
// a real ward instead of typing free-text. Only safe summary fields
// are returned (no coordinator contact details).
router.get("/wards", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: wardsTable.id,
        name: wardsTable.name,
        area: wardsTable.area,
      })
      .from(wardsTable)
      .orderBy(wardsTable.name);
    res.json(rows);
  } catch (err) {
    console.error("[site] wards list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
