import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const auditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
