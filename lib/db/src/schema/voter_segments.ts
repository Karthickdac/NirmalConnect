import {
  pgTable, text, serial, integer, timestamp, index, uniqueIndex, jsonb, boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Voter segments (task #46/Phase 3) ────────────────────────────
//
// Saved filter presets — a campaign manager builds a filter (e.g.
// "Female 25-40 in Ward 3 tagged Supporter, no contact in 60 days")
// and saves it as a segment. The segment can be re-opened by the
// owner, and optionally shared to a role (visible to every staffer
// with that role) so coordinators can re-use the manager's targeting.
//
// `filterJson` is the same shape as the GET /admin/voters query
// params. We don't validate it server-side beyond JSON parse — the
// search endpoint already rejects unknown / bad fields.

export const voterSegmentsTable = pgTable("voter_segments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // Filter as JSON: matches the search-endpoint param shape.
  filterJson: jsonb("filter_json").notNull(),
  // Owner — only the owner (and super_admin) may edit/delete.
  ownerUserId: integer("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  ownerName: text("owner_name").notNull(),
  // Sharing: NULL = private to owner; "*" = visible to all staff;
  // a specific role string = visible to that role only. We keep the
  // shape simple to start; per-user shares can be added later.
  sharedWithRole: text("shared_with_role"),
  // Pinned segments float to the top of the list.
  pinned: boolean("pinned").notNull().default(false),
  // Cached count from the last refresh — updated lazily by the UI
  // so the segment list shows a "≈ 1,234 voters" hint without re-
  // running every query on each list paint.
  lastCount: integer("last_count"),
  lastCountAt: timestamp("last_count_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  nameUnique: uniqueIndex("voter_segments_name_unique").on(t.name),
  ownerIdx: index("voter_segments_owner_idx").on(t.ownerUserId),
}));

export type VoterSegment = typeof voterSegmentsTable.$inferSelect;
