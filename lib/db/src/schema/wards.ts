import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wardsTable = pgTable("wards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  area: text("area"),
  coordinatorName: text("coordinator_name"),
  coordinatorPhone: text("coordinator_phone"),
  coordinatorEmail: text("coordinator_email"),
  population: integer("population"),
  households: integer("households"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWardSchema = createInsertSchema(wardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWard = z.infer<typeof insertWardSchema>;
export type Ward = typeof wardsTable.$inferSelect;
