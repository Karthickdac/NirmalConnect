#!/usr/bin/env node
// Fetches administrative boundaries inside the AC 195 Thiruparankundram
// bounding box from the OpenStreetMap Overpass API and writes them to
// lib/db/data/ward-boundaries.geojson.
//
// Usage:  node lib/db/scripts/fetch-ward-boundaries.mjs
//
// Output features carry properties.wardId. Currently only one feature
// (Madurai Municipal Corporation outline, OSM relation 11268397) is
// available at admin_level<=10 inside the constituency bbox; per-ward
// boundaries are not yet mapped. Re-run this script when more relations
// appear in OSM, or merge in offline data from opencity.in / NIC and
// hand-edit the wardId mapping.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "../data/ward-boundaries.geojson");

// AC 195 bbox: south, west, north, east
const BBOX = [9.85, 78.0, 9.97, 78.18];
const ENDPOINT = "https://overpass-api.de/api/interpreter";

const QUERY = `
[out:json][timeout:60];
(
  relation["boundary"="administrative"]["admin_level"~"^(8|9|10|11)$"](${BBOX.join(",")});
);
(._;>;);
out geom;
`;

async function main() {
  console.log("[boundaries] querying Overpass…");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  const ways = new Map();
  for (const el of data.elements) if (el.type === "way") ways.set(el.id, el);

  const features = [];
  for (const rel of data.elements) {
    if (rel.type !== "relation") continue;
    const outers = (rel.members ?? []).filter(
      (m) => m.type === "way" && (m.role === "outer" || m.role === ""),
    );
    const segments = outers
      .map((m) => {
        const w = ways.get(m.ref);
        return w?.geometry ? w.geometry.map((g) => [g.lon, g.lat]) : null;
      })
      .filter(Boolean);
    if (segments.length === 0) continue;

    let ring = [];
    for (const s of segments) {
      if (ring.length === 0) ring = s.slice();
      else {
        const last = ring[ring.length - 1];
        if (last[0] === s[0][0] && last[1] === s[0][1]) ring = ring.concat(s.slice(1));
        else if (last[0] === s.at(-1)[0] && last[1] === s.at(-1)[1])
          ring = ring.concat(s.slice().reverse().slice(1));
        else ring = ring.concat(s);
      }
    }
    if (ring.length < 4) continue;
    if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push(ring[0]);

    features.push({
      type: "Feature",
      properties: {
        // wardId 0 = no per-ward mapping yet; staff should hand-edit
        // this to the matching wards.id once boundaries are mapped.
        wardId: 0,
        name: rel.tags?.name ?? `OSM ${rel.id}`,
        nameTa: rel.tags?.["name:ta"] ?? null,
        source: `OSM relation ${rel.id}`,
        admin_level: Number(rel.tags?.admin_level ?? 0),
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }

  const fc = {
    type: "FeatureCollection",
    name: "ac195_thiruparankundram_ward_boundaries",
    license: "ODbL-1.0 (OpenStreetMap)",
    sources: ["OpenStreetMap via Overpass API"],
    notes:
      "Per-feature properties.wardId must match a row in the wards table. " +
      "Hand-edit wardId values after regeneration. See lib/db/data/data-sources.md.",
    features,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(fc, null, 2));
  console.log(`[boundaries] wrote ${features.length} feature(s) to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error("[boundaries] failed:", e);
  process.exit(1);
});
