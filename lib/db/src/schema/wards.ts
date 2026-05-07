import { pgTable, text, serial, integer, timestamp, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Wards / Areas ────────────────────────────────────────
//
// A "ward" in this project is the lowest stable administrative unit
// inside the Tirupparankundram constituency that an officer / coordinator
// can be made responsible for. The same table holds:
//   - Madurai Corporation wards (urban) — wardType = "corporation_ward"
//   - Town panchayats / municipal areas — wardType = "town_panchayat"
//   - Village panchayats (rural)         — wardType = "panchayat"
//   - Revenue villages (rural sub-units) — wardType = "revenue_village"
//   - Madurai Corp zone-level groupings  — wardType = "madurai_corp_zone"
//
// Every ward is grouped under a `zone` (5 Madurai Corp zones + 1 "Rural"
// virtual zone for non-corporation areas) and carries optional Tamil
// names, pincode, and GPS so the GIS map and bilingual UI can render
// the entry without joining other tables.
//
// All new columns added in Task #15 are NULLABLE so the existing
// records (and existing grievance/volunteer/officer rows that store
// the ward as free text) continue to work unchanged.
export const WARD_TYPES = [
  "corporation_ward",
  "madurai_corp_zone",
  "town_panchayat",
  "panchayat",
  "revenue_village",
] as const;

export const wardsTable = pgTable("wards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  slug: text("slug"),
  wardType: text("ward_type"),
  zoneId: integer("zone_id"),
  area: text("area"),
  pincode: text("pincode"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  coordinatorName: text("coordinator_name"),
  coordinatorPhone: text("coordinator_phone"),
  coordinatorEmail: text("coordinator_email"),
  population: integer("population"),
  households: integer("households"),
  notes: text("notes"),
  // GeoJSON polygon string (preserved from ward-boundary import).
  // Kept as nullable text so drizzle-kit doesn't drop the underlying
  // column on schema push.
  boundaryGeojson: text("boundary_geojson"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  slugIdx: index("wards_slug_idx").on(t.slug),
  zoneIdx: index("wards_zone_idx").on(t.zoneId),
}));

export const insertWardSchema = createInsertSchema(wardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWard = z.infer<typeof insertWardSchema>;
export type Ward = typeof wardsTable.$inferSelect;
