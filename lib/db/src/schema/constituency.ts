import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const constituenciesTable = pgTable("constituencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const constituencyStatsTable = pgTable("constituency_stats", {
  id: serial("id").primaryKey(),
  roadsBuiltKm: real("roads_built_km").notNull().default(0),
  waterProjectsCompleted: integer("water_projects_completed").notNull().default(0),
  schoolsUpgraded: integer("schools_upgraded").notNull().default(0),
  healthClinicsOpened: integer("health_clinics_opened").notNull().default(0),
  jobsCreated: integer("jobs_created").notNull().default(0),
  beneficiariesServed: integer("beneficiaries_served").notNull().default(0),
  totalProjects: integer("total_projects").notNull().default(0),
  completedProjects: integer("completed_projects").notNull().default(0),
  ongoingProjects: integer("ongoing_projects").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConstituencyStatsSchema = createInsertSchema(constituencyStatsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertConstituencyStats = z.infer<typeof insertConstituencyStatsSchema>;
export type ConstituencyStats = typeof constituencyStatsTable.$inferSelect;
