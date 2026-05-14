import { Router } from "express";
import { db } from "@workspace/db";
import { siteConfigTable, wardsTable, zonesTable, areasTable, pollingStationsTable, pincodesTable, pincodeWardsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: ReturnType<typeof Router> = Router();

// Public, unauthenticated list of wards/areas — used by the public
// Grievance and Volunteer forms (ward dropdowns) and by admin maps.
router.get("/wards", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: wardsTable.id,
        name: wardsTable.name,
        nameTa: wardsTable.nameTa,
        slug: wardsTable.slug,
        wardType: wardsTable.wardType,
        zoneId: wardsTable.zoneId,
        area: wardsTable.area,
        pincode: wardsTable.pincode,
      })
      .from(wardsTable)
      .orderBy(asc(wardsTable.name));
    res.json(rows);
  } catch (err) {
    console.error("[site] wards list:", err);
    res.status(500).json({ error: "Failed to load wards" });
  }
});

// ── Constituency hierarchy (public, read-only) ─────────────
// Used by the bilingual constituency map, GIS heatmap, and admin
// pickers. Everything is summary-shaped — no contact details.

router.get("/zones", async (_req, res) => {
  try {
    const rows = await db.select({
      id: zonesTable.id, name: zonesTable.name, nameTa: zonesTable.nameTa,
      slug: zonesTable.slug, type: zonesTable.type, description: zonesTable.description,
    }).from(zonesTable).orderBy(asc(zonesTable.id));
    res.json(rows);
  } catch (err) {
    console.error("[site] zones list:", err);
    res.status(500).json({ error: "Failed to load zones" });
  }
});

router.get("/zones/:id/wards", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid zone id" });
    const rows = await db.select({
      id: wardsTable.id, name: wardsTable.name, nameTa: wardsTable.nameTa,
      slug: wardsTable.slug, wardType: wardsTable.wardType, zoneId: wardsTable.zoneId,
      area: wardsTable.area, pincode: wardsTable.pincode,
    }).from(wardsTable).where(eq(wardsTable.zoneId, id)).orderBy(asc(wardsTable.name));
    res.json(rows);
  } catch (err) {
    console.error("[site] wards by zone:", err);
    res.status(500).json({ error: "Failed to load wards for zone" });
  }
});

router.get("/wards/:id/areas", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid ward id" });
    const rows = await db.select({
      id: areasTable.id, wardId: areasTable.wardId, name: areasTable.name,
      nameTa: areasTable.nameTa, areaType: areasTable.areaType,
    }).from(areasTable).where(eq(areasTable.wardId, id)).orderBy(asc(areasTable.name));
    res.json(rows);
  } catch (err) {
    console.error("[site] areas by ward:", err);
    res.status(500).json({ error: "Failed to load areas for ward" });
  }
});

router.get("/wards/:id/polling-stations", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid ward id" });
    const rows = await db.select({
      id: pollingStationsTable.id, boothNo: pollingStationsTable.boothNo,
      name: pollingStationsTable.name, nameTa: pollingStationsTable.nameTa,
      address: pollingStationsTable.address, wardId: pollingStationsTable.wardId,
      pincode: pollingStationsTable.pincode, voterType: pollingStationsTable.voterType,
      latitude: pollingStationsTable.latitude, longitude: pollingStationsTable.longitude,
    }).from(pollingStationsTable).where(eq(pollingStationsTable.wardId, id))
      .orderBy(asc(pollingStationsTable.slNo));
    res.json(rows);
  } catch (err) {
    console.error("[site] polling stations by ward:", err);
    res.status(500).json({ error: "Failed to load polling stations" });
  }
});

router.get("/polling-stations", async (_req, res) => {
  try {
    const rows = await db.select({
      id: pollingStationsTable.id, boothNo: pollingStationsTable.boothNo,
      name: pollingStationsTable.name, nameTa: pollingStationsTable.nameTa,
      address: pollingStationsTable.address, wardId: pollingStationsTable.wardId,
      pincode: pollingStationsTable.pincode, voterType: pollingStationsTable.voterType,
      latitude: pollingStationsTable.latitude, longitude: pollingStationsTable.longitude,
    }).from(pollingStationsTable).orderBy(asc(pollingStationsTable.slNo));
    res.json(rows);
  } catch (err) {
    console.error("[site] polling stations list:", err);
    res.status(500).json({ error: "Failed to load polling stations" });
  }
});

router.get("/pincodes", async (_req, res) => {
  try {
    const rows = await db.select({
      id: pincodesTable.id, code: pincodesTable.code,
      label: pincodesTable.label, labelTa: pincodesTable.labelTa,
    }).from(pincodesTable).orderBy(asc(pincodesTable.code));
    // Attach ward IDs for each pincode in one extra query.
    const links = await db.select().from(pincodeWardsTable);
    const map = new Map<number, number[]>();
    for (const l of links) {
      const arr = map.get(l.pincodeId) ?? [];
      arr.push(l.wardId);
      map.set(l.pincodeId, arr);
    }
    res.json(rows.map((r) => ({ ...r, wardIds: map.get(r.id) ?? [] })));
  } catch (err) {
    console.error("[site] pincodes list:", err);
    res.status(500).json({ error: "Failed to load pincodes" });
  }
});

// Mirrors GET /api/admin/settings (key=home_hero) so the public Home
// page can render the editable hero copy without auth.
router.get("/home-hero", async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(siteConfigTable)
      .where(eq(siteConfigTable.key, "home_hero"))
      .limit(1);
    if (!row) { res.json(null); return; }
    res.json(JSON.parse(row.value));
  } catch (err) {
    console.error("[site] home-hero get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Public endpoint returning the leader_config JSON blob — used by the
// LeaderConfigContext so every component gets name, constituency, party,
// contact info etc. from the DB without hard-coding them.
router.get("/leader-config", async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(siteConfigTable)
      .where(eq(siteConfigTable.key, "leader_config"))
      .limit(1);
    if (!row) { res.json(null); return; }
    res.json(JSON.parse(row.value));
  } catch (err) {
    console.error("[site] leader-config get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mirrors GET /api/admin/about (which is staff-only) so the public
// About page can render live CMS content without exposing admin routes.
router.get("/about", async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(siteConfigTable)
      .where(eq(siteConfigTable.key, "about"))
      .limit(1);
    if (!row) { res.json(null); return; }
    res.json(JSON.parse(row.value));
  } catch (err) {
    console.error("[site] about get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
