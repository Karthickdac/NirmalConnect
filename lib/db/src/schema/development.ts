import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const developmentProjectsTable = pgTable("development_projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  titleTa: text("title_ta"),
  category: text("category").notNull().default("Roads"),
  categoryTa: text("category_ta"),
  status: text("status").notNull().default("Ongoing"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDevelopmentProjectSchema = createInsertSchema(developmentProjectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDevelopmentProject = z.infer<typeof insertDevelopmentProjectSchema>;
export type DevelopmentProject = typeof developmentProjectsTable.$inferSelect;
