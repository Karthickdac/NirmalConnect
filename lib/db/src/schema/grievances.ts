import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { votersTable } from "./voters";

export const GRIEVANCE_CATEGORIES = [
  "Roads",
  "Water Supply",
  "EB / Electricity Issues",
  "Sewage",
  "Healthcare",
  "Education",
  "Women Safety",
  "Corruption",
  "Ration",
  "Transport",
  "Pension",
  "Housing",
  "Agriculture",
  "Employment",
  "Others",
] as const;

export const GRIEVANCE_STATUSES = [
  "Submitted",
  "Under Review",
  "Assigned",
  "In Progress",
  "Resolved",
  "Closed",
] as const;

export const GRIEVANCE_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;

export const grievancesTable = pgTable("grievances", {
  id: serial("id").primaryKey(),
  ticketNo: text("ticket_no").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  category: text("category").notNull(),
  description: text("description").notNull(),
  address: text("address"),
  ward: text("ward"),
  constituency: text("constituency").notNull().default("Tirupparankundram"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Submitted"),
  anonymous: boolean("anonymous").notNull().default(false),
  assignedTo: integer("assigned_to"),
  // Optional sub-ward routing scope captured at submit time.
  // Used by the auto-router and admin matrix.
  areaId: integer("area_id"),
  pollingStationId: integer("polling_station_id"),
  // Optional citizen-supplied GPS pin (drop-pin or "use my location") so the
  // analytics heatmap can plot reports outside any registered booth/ward.
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // Optional link to a known voter (electoral roll). Null when the
  // grievance was filed anonymously or no match was found yet.
  // ON DELETE SET NULL: removing a voter row should not delete the
  // grievance — we keep the complaint and just clear the link.
  voterId: integer("voter_id").references(() => votersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  voterIdx: index("grievances_voter_idx").on(t.voterId),
}));

// Audit trail for voter-link changes on grievances. Mirrors the pattern
// used by grievance_status_log / grievance_routing_log so reviewers can
// reconstruct who linked which voter to which grievance and when.
export const grievanceVoterLinkLogTable = pgTable("grievance_voter_link_log", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  voterIdOld: integer("voter_id_old"),
  voterIdNew: integer("voter_id_new"),
  reason: text("reason").notNull().default("manual"), // manual | unlink
  changedBy: integer("changed_by"),
  changedByName: text("changed_by_name").notNull().default("System"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  grievanceIdx: index("grievance_voter_link_log_grievance_idx").on(t.grievanceId),
}));

export const grievanceAttachmentsTable = pgTable("grievance_attachments", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const grievanceRemarksTable = pgTable("grievance_remarks", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  remark: text("remark").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  authorId: integer("author_id"),
  authorName: text("author_name").notNull().default("Office"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const grievanceStatusLogTable = pgTable("grievance_status_log", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: integer("changed_by"),
  changedByName: text("changed_by_name").notNull().default("System"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGrievanceSchema = createInsertSchema(grievancesTable).omit({
  id: true,
  ticketNo: true,
  status: true,
  assignedTo: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGrievance = z.infer<typeof insertGrievanceSchema>;
export type Grievance = typeof grievancesTable.$inferSelect;
export type GrievanceAttachment = typeof grievanceAttachmentsTable.$inferSelect;
export type GrievanceRemark = typeof grievanceRemarksTable.$inferSelect;
export type GrievanceStatusLog = typeof grievanceStatusLogTable.$inferSelect;
