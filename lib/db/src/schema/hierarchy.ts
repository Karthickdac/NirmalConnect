import {
  pgTable, text, serial, integer, real, timestamp, index, primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Constituency administrative hierarchy ─────────────────
//
// Tirupparankundram (AC 195) covers two distinct admin geographies:
//
//   1. The Madurai Municipal Corporation, organised into 5 zones
//      (East / North / Central / South / West, 100 wards total —
//      this constituency contains the southern slice of that grid).
//   2. Rural panchayats / revenue villages on the southern and
//      western edge of Madurai District (Vadapalanji, Karadipatti,
//      Thirumohur, Vellaripatti, etc.).
//
// To keep the model uniform we store every grouping in the `zones`
// table — the 5 corp zones + a single virtual "Rural" zone for
// non-corporation areas. Wards roll up to a zone, areas roll up to
// a ward, streets roll up to an area, and polling_stations link to
// the ward (and optionally the area) they serve.
//
// Pincodes are stored separately because one pincode often spans
// many wards and a single ward can have several pincodes.
//
// All names exist in both English and Tamil. Tamil is intentionally
// nullable so we never store machine-translated guesses — staff can
// fill the Tamil version from the admin UI in the next task.

// ── Zones ────────────────────────────────────────────────
export const ZONE_TYPES = ["corporation", "rural"] as const;

export const zonesTable = pgTable("zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  slug: text("slug").notNull(),
  type: text("type").notNull().default("corporation"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  slugIdx: index("zones_slug_idx").on(t.slug),
}));

// ── Areas (sub-locality inside a ward) ───────────────────
export const areasTable = pgTable("areas", {
  id: serial("id").primaryKey(),
  wardId: integer("ward_id").notNull(),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  areaType: text("area_type"), // colony / nagar / street-cluster / etc.
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  wardIdx: index("areas_ward_idx").on(t.wardId),
}));

// ── Streets (inside an area) ─────────────────────────────
export const streetsTable = pgTable("streets", {
  id: serial("id").primaryKey(),
  areaId: integer("area_id").notNull(),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  pincode: text("pincode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  areaIdx: index("streets_area_idx").on(t.areaId),
}));

// ── Polling Stations (booths) ────────────────────────────
//
// One row per polling station as published in the official
// AC 195 Thiruparankundram polling-station list. The booth_no is
// the human number used on the EVM / voter slip; sl_no is the row
// number from the source PDF. lat/lng are nullable because ECI does
// not publish GPS — staff capture it later via the admin UI.
export const VOTER_TYPES = ["all", "men_only", "women_only"] as const;

export const pollingStationsTable = pgTable("polling_stations", {
  id: serial("id").primaryKey(),
  boothNo: text("booth_no").notNull(),
  slNo: integer("sl_no"),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  address: text("address"),
  addressTa: text("address_ta"),
  wardId: integer("ward_id"),
  areaId: integer("area_id"),
  pincode: text("pincode"),
  voterType: text("voter_type").notNull().default("all"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  rawAreas: text("raw_areas"), // JSON: original "Polling Areas" column from the PDF
  source: text("source"),      // URL of the source document
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  boothIdx: index("polling_stations_booth_idx").on(t.boothNo),
  wardIdx: index("polling_stations_ward_idx").on(t.wardId),
  pincodeIdx: index("polling_stations_pincode_idx").on(t.pincode),
}));

// ── Pincodes covering the constituency ───────────────────
export const pincodesTable = pgTable("pincodes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label"),
  labelTa: text("label_ta"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Many-to-many: a pincode can map to multiple wards.
export const pincodeWardsTable = pgTable("pincode_wards", {
  pincodeId: integer("pincode_id").notNull(),
  wardId: integer("ward_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.pincodeId, t.wardId] }),
}));

// ── Zod schemas + types ──────────────────────────────────
export const insertZoneSchema = createInsertSchema(zonesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAreaSchema = createInsertSchema(areasTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStreetSchema = createInsertSchema(streetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPollingStationSchema = createInsertSchema(pollingStationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPincodeSchema = createInsertSchema(pincodesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zonesTable.$inferSelect;
export type InsertArea = z.infer<typeof insertAreaSchema>;
export type Area = typeof areasTable.$inferSelect;
export type InsertStreet = z.infer<typeof insertStreetSchema>;
export type Street = typeof streetsTable.$inferSelect;
export type InsertPollingStation = z.infer<typeof insertPollingStationSchema>;
export type PollingStation = typeof pollingStationsTable.$inferSelect;
export type InsertPincode = z.infer<typeof insertPincodeSchema>;
export type Pincode = typeof pincodesTable.$inferSelect;
export type PincodeWard = typeof pincodeWardsTable.$inferSelect;
