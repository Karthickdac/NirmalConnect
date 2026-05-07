import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  wardsTable,
  zonesTable,
  pollingStationsTable,
  grievancesTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, isNotNull, or } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const router: IRouter = Router();

// Resolve the openly-licensed boundary file shipped under lib/db/data.
// Documented in lib/db/data/data-sources.md. The file is a GeoJSON
// FeatureCollection where each feature's `properties.wardId` matches a
// row in the `wards` table. Wards without a matching feature fall back
// to a centroid pin on the public map.
// IMPORTANT: at runtime this module lives in `artifacts/api-server/dist/`
// (esbuild bundles to a single file). So __dirname is the dist folder
// and the workspace root is three levels up — NOT four.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOUNDARIES_PATH = path.resolve(
  __dirname,
  "../../../lib/db/data/ward-boundaries.geojson",
);
const OUTLINES_PATH = path.resolve(
  __dirname,
  "../../../lib/db/data/constituency-outlines.geojson",
);

interface GeoJsonFeature {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown> | null;
}
interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}
type BoundaryEntry = { wardId: number; feature: GeoJsonFeature };

let cachedBoundaries: BoundaryEntry[] | null = null;
function loadBoundaryFeatures(): BoundaryEntry[] {
  if (cachedBoundaries) return cachedBoundaries;
  let result: BoundaryEntry[] = [];
  try {
    const raw = fs.readFileSync(BOUNDARIES_PATH, "utf8");
    const parsed = JSON.parse(raw) as GeoJsonFeatureCollection;
    const features = Array.isArray(parsed?.features) ? parsed.features : [];
    result = features
      .filter((f) => Boolean(f?.geometry) && typeof f?.properties?.wardId === "number")
      .map((f) => ({ wardId: Number(f.properties!.wardId), feature: f }));
  } catch {
    result = [];
  }
  cachedBoundaries = result;
  return result;
}

let cachedOutlines: GeoJsonFeatureCollection | null = null;
function loadConstituencyOutlines(): GeoJsonFeatureCollection {
  if (cachedOutlines) return cachedOutlines;
  let result: GeoJsonFeatureCollection = { type: "FeatureCollection", features: [] };
  try {
    const raw = fs.readFileSync(OUTLINES_PATH, "utf8");
    const parsed = JSON.parse(raw) as GeoJsonFeatureCollection;
    if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
      result = parsed;
    }
  } catch {
    /* file is optional */
  }
  cachedOutlines = result;
  return result;
}

// GET /api/map/data — public bundle for the constituency map.
// Returns zones, wards (with centroid + optional boundary feature),
// and polling stations that have GPS coordinates. No PII is exposed.
router.get("/map/data", async (_req, res) => {
  try {
    const [zones, wards, booths] = await Promise.all([
      db.select({
        id: zonesTable.id,
        name: zonesTable.name,
        nameTa: zonesTable.nameTa,
        type: zonesTable.type,
      }).from(zonesTable).orderBy(asc(zonesTable.name)),
      db.select({
        id: wardsTable.id,
        name: wardsTable.name,
        nameTa: wardsTable.nameTa,
        zoneId: wardsTable.zoneId,
        wardType: wardsTable.wardType,
        latitude: wardsTable.latitude,
        longitude: wardsTable.longitude,
      }).from(wardsTable).orderBy(asc(wardsTable.name)),
      db.select({
        id: pollingStationsTable.id,
        boothNo: pollingStationsTable.boothNo,
        name: pollingStationsTable.name,
        nameTa: pollingStationsTable.nameTa,
        address: pollingStationsTable.address,
        addressTa: pollingStationsTable.addressTa,
        wardId: pollingStationsTable.wardId,
        areaId: pollingStationsTable.areaId,
        latitude: pollingStationsTable.latitude,
        longitude: pollingStationsTable.longitude,
      })
        .from(pollingStationsTable)
        .where(and(isNotNull(pollingStationsTable.latitude), isNotNull(pollingStationsTable.longitude)))
        .orderBy(asc(pollingStationsTable.slNo)),
    ]);

    // Boundaries come exclusively from the file-based dataset documented
    // in lib/db/data/data-sources.md. There is intentionally no DB column
    // for per-row boundaries — the file is the canonical source so this
    // endpoint never depends on a schema migration.
    const fileBoundaries = loadBoundaryFeatures();
    const fileMap = new Map<number, GeoJsonFeature>();
    for (const b of fileBoundaries) fileMap.set(b.wardId, b.feature);

    const wardsOut = wards.map((w) => {
      const boundary = fileMap.get(w.id) ?? null;
      return {
        id: w.id,
        name: w.name,
        nameTa: w.nameTa,
        zoneId: w.zoneId,
        wardType: w.wardType,
        latitude: w.latitude,
        longitude: w.longitude,
        boundary,
        hasBoundary: Boolean(boundary),
      };
    });

    res.json({
      zones,
      wards: wardsOut,
      pollingStations: booths,
      constituencyOutlines: loadConstituencyOutlines(),
    });
  } catch (err) {
    console.error("[map] data error:", err);
    res.status(500).json({ error: "Failed to load map data" });
  }
});

// GET /api/map/grievance-pins — public, sanitized aggregate of recent
// open grievances joined to their booth's GPS. Exposes only a coarse
// id, status and ward — never name/phone/description — so the public
// can see "where issues are reported" without leaking PII.
router.get("/map/grievance-pins", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: grievancesTable.id,
        status: grievancesTable.status,
        category: grievancesTable.category,
        wardId: pollingStationsTable.wardId,
        areaId: pollingStationsTable.areaId,
        pollingStationId: pollingStationsTable.id,
        latitude: pollingStationsTable.latitude,
        longitude: pollingStationsTable.longitude,
        createdAt: grievancesTable.createdAt,
      })
      .from(grievancesTable)
      .innerJoin(
        pollingStationsTable,
        eq(grievancesTable.pollingStationId, pollingStationsTable.id),
      )
      .where(
        and(
          isNotNull(pollingStationsTable.latitude),
          isNotNull(pollingStationsTable.longitude),
          or(
            eq(grievancesTable.status, "Submitted"),
            eq(grievancesTable.status, "In Progress"),
            eq(grievancesTable.status, "Acknowledged"),
          ),
        ),
      )
      .orderBy(desc(grievancesTable.createdAt))
      .limit(500);

    res.json(rows);
  } catch (err) {
    console.error("[map] grievance-pins error:", err);
    res.status(500).json({ error: "Failed to load grievance pins" });
  }
});

export default router;
