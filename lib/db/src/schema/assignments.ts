import {
  pgTable, serial, integer, text, timestamp, boolean, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Officer / coordinator → ward / area / booth assignments ──
//
// Links a staff user (officers, coordinators) to one or more wards,
// areas, or polling stations. Used by the grievance auto-router
// to pick the right owner for an incoming complaint.
//
// All three scope columns (wardId, areaId, pollingStationId) are
// nullable so an assignment can be made at any specificity:
//   - ward only           → owns the whole ward
//   - ward + area         → owns the area inside that ward
//   - ward + area + booth → owns the specific booth
//
// `roleLabel` is a free-text label ("Ward Officer", "Area Coordinator")
// that admins can use for documentation; the actual permission check
// still relies on usersTable.role.
export const officerAssignmentsTable = pgTable("officer_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  wardId: integer("ward_id"),
  areaId: integer("area_id"),
  pollingStationId: integer("polling_station_id"),
  roleLabel: text("role_label"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  userIdx: index("officer_assignments_user_idx").on(t.userId),
  wardIdx: index("officer_assignments_ward_idx").on(t.wardId),
  areaIdx: index("officer_assignments_area_idx").on(t.areaId),
  boothIdx: index("officer_assignments_booth_idx").on(t.pollingStationId),
  // prevent duplicates: same user + same exact scope
  uniq: uniqueIndex("officer_assignments_uniq").on(t.userId, t.wardId, t.areaId, t.pollingStationId),
}));

// Volunteer → ward / area / booth assignments. Mirrors the officer
// table but references volunteersTable.id (the citizens who signed up
// via the public Volunteer form), so volunteer coordinators can see
// who covers which booth.
export const volunteerAssignmentsTable = pgTable("volunteer_assignments", {
  id: serial("id").primaryKey(),
  volunteerId: integer("volunteer_id").notNull(),
  wardId: integer("ward_id"),
  areaId: integer("area_id"),
  pollingStationId: integer("polling_station_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  volunteerIdx: index("volunteer_assignments_vol_idx").on(t.volunteerId),
  wardIdx: index("volunteer_assignments_ward_idx").on(t.wardId),
  uniq: uniqueIndex("volunteer_assignments_uniq").on(t.volunteerId, t.wardId, t.areaId, t.pollingStationId),
}));

// Audit row written every time a grievance is auto-routed or
// manually reassigned. Sits beside grievance_status_log so the
// inbox can show a single combined timeline if needed.
export const ROUTING_REASONS = ["auto", "manual", "reassign", "unassigned"] as const;
export const ROUTING_SCOPES = ["booth", "area", "ward", "none"] as const;

export const grievanceRoutingLogTable = pgTable("grievance_routing_log", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  fromOfficerId: integer("from_officer_id"),
  toOfficerId: integer("to_officer_id"),
  reason: text("reason").notNull().default("auto"),
  matchedScope: text("matched_scope").notNull().default("none"),
  matchedScopeId: integer("matched_scope_id"),
  changedBy: integer("changed_by"),
  changedByName: text("changed_by_name").notNull().default("System"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  grievanceIdx: index("grievance_routing_log_grievance_idx").on(t.grievanceId),
}));

export const insertOfficerAssignmentSchema = createInsertSchema(officerAssignmentsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertVolunteerAssignmentSchema = createInsertSchema(volunteerAssignmentsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export type OfficerAssignment = typeof officerAssignmentsTable.$inferSelect;
export type InsertOfficerAssignment = z.infer<typeof insertOfficerAssignmentSchema>;
export type VolunteerAssignment = typeof volunteerAssignmentsTable.$inferSelect;
export type InsertVolunteerAssignment = z.infer<typeof insertVolunteerAssignmentSchema>;
export type GrievanceRoutingLog = typeof grievanceRoutingLogTable.$inferSelect;
