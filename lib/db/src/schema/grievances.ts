import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

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
