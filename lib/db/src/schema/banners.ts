import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  titleTa: text("title_ta"),
  subtitle: text("subtitle"),
  subtitleTa: text("subtitle_ta"),
  ctaText: text("cta_text"),
  ctaUrl: text("cta_url"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Banner = typeof bannersTable.$inferSelect;
export type InsertBanner = typeof bannersTable.$inferInsert;
